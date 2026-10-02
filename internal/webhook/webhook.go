// Package webhook loads webhook.json and POSTs prompt wakes.
package webhook

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Config is the on-disk webhook.json (chmod 600).
type Config struct {
	URL string `json:"url"`
	Key string `json:"key"`
}

// Payload is sent to the automation webhook.
type Payload struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Prompt string `json:"prompt"`
	Action string `json:"action,omitempty"`
}

// Client posts wakes and appends wakes.jsonl.
type Client struct {
	Path      string // webhook.json path
	WakesPath string // wakes.jsonl path
	HTTP      *http.Client

	mu  sync.Mutex
	cfg Config
}

func New(path, wakesPath string) *Client {
	return &Client{
		Path:      path,
		WakesPath: wakesPath,
		HTTP:      &http.Client{Timeout: 12 * time.Second},
	}
}

// Load reads webhook.json if present.
func (c *Client) Load() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	data, err := os.ReadFile(c.Path)
	if err != nil {
		if os.IsNotExist(err) {
			c.cfg = Config{}
			return nil
		}
		return err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return err
	}
	c.cfg = cfg
	return nil
}

// Configured reports whether URL and key are both set.
func (c *Client) Configured() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.cfg.URL != "" && c.cfg.Key != ""
}

// Snapshot returns a copy of the current config (key redacted in String elsewhere).
func (c *Client) Snapshot() Config {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.cfg
}

// SetConfig writes webhook.json with mode 0600.
func (c *Client) SetConfig(cfg Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	if err := os.WriteFile(c.Path, data, 0o600); err != nil {
		return err
	}
	c.mu.Lock()
	c.cfg = cfg
	c.mu.Unlock()
	return nil
}

// Post sends the payload; action:skip is supported for probes.
func (c *Client) Post(p Payload) (int, string, error) {
	if err := c.Load(); err != nil {
		return 0, "", err
	}
	c.mu.Lock()
	cfg := c.cfg
	c.mu.Unlock()
	if cfg.URL == "" || cfg.Key == "" {
		_ = c.appendWake(p, 0, "missing webhook url or key")
		return 503, "missing webhook url or key", fmt.Errorf("webhook not configured")
	}
	body, _ := json.Marshal(p)
	req, err := http.NewRequest(http.MethodPost, cfg.URL, bytes.NewReader(body))
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.Key)
	req.Header.Set("X-Automation-Key", cfg.Key)
	req.Header.Set("User-Agent", "botvillage/1.0")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		_ = c.appendWake(p, 0, err.Error())
		return 0, "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	detail := string(b)
	_ = c.appendWake(p, resp.StatusCode, detail)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return resp.StatusCode, detail, fmt.Errorf("webhook HTTP %d", resp.StatusCode)
	}
	return resp.StatusCode, detail, nil
}

func (c *Client) appendWake(p Payload, status int, detail string) error {
	if c.WakesPath == "" {
		return nil
	}
	_ = os.MkdirAll(filepath.Dir(c.WakesPath), 0o755)
	rec := map[string]any{
		"ts":     time.Now().Format(time.RFC3339),
		"id":     p.ID,
		"name":   p.Name,
		"promptLen": len(p.Prompt),
		"action": p.Action,
		"status": status,
		"detail": truncate(detail, 400),
	}
	line, _ := json.Marshal(rec)
	f, err := os.OpenFile(c.WakesPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_ = os.Chmod(c.WakesPath, 0o600)
	defer f.Close()
	_, err = f.Write(append(line, '\n'))
	return err
}

// redactPrompt drops prompt plaintext. wakes.jsonl keeps a length only.
func redactPrompt(s string) string {
	if strings.TrimSpace(s) == "" {
		return ""
	}
	return ""
}

// EnsureWakesPerms chmods an existing wakes.jsonl to 0600 if present.
func (c *Client) EnsureWakesPerms() {
	if c.WakesPath == "" {
		return
	}
	_ = os.Chmod(c.WakesPath, 0o600)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
