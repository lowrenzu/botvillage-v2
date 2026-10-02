// Package grokbuild calls the Grok Build model on api.x.ai.
// The key stays in XAI_API_KEY or xai.json. It is never written to the page.
package grokbuild

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const Model = "grok-4.7"
const endpoint = "https://api.x.ai/v1/responses"

type Client struct {
	Key  string
	HTTP *http.Client
}

func FromEnv(path string) Client {
	key := strings.TrimSpace(os.Getenv("XAI_API_KEY"))
	if key == "" && path != "" {
		b, err := os.ReadFile(path)
		if err == nil {
			var f struct {
				Key string `json:"key"`
			}
			if json.Unmarshal(b, &f) == nil {
				key = strings.TrimSpace(f.Key)
			}
		}
	}
	return Client{Key: key, HTTP: &http.Client{Timeout: 70 * time.Second}}
}

func (c Client) Configured() bool { return c.Key != "" }

// Reply posts a coding prompt to Grok Build and returns the text.
func (c Client) Reply(prompt string) (string, error) {
	if !c.Configured() {
		return "", fmt.Errorf("missing XAI_API_KEY")
	}
	body, _ := json.Marshal(map[string]string{"model": Model, "input": prompt})
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("grok build HTTP %d", resp.StatusCode)
	}
	text := outputText(raw)
	if text == "" {
		return "", fmt.Errorf("empty grok build reply")
	}
	return text, nil
}

func outputText(raw []byte) string {
	var m map[string]any
	if json.Unmarshal(raw, &m) != nil {
		return ""
	}
	if s, ok := m["output_text"].(string); ok && strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	out, _ := m["output"].([]any)
	var b strings.Builder
	for _, item := range out {
		obj, _ := item.(map[string]any)
		content, _ := obj["content"].([]any)
		for _, c := range content {
			cm, _ := c.(map[string]any)
			if t, ok := cm["text"].(string); ok {
				b.WriteString(t)
			}
		}
	}
	return strings.TrimSpace(b.String())
}
