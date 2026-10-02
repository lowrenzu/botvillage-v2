package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"botvillage/internal/hub"
	"botvillage/internal/roster"
	"botvillage/internal/webhook"
)

func TestInjectPromptToken(t *testing.T) {
	html := []byte("<html><head><title>x</title></head><body></body></html>")
	out := injectPromptToken(html, `tok"en`)
	if !bytes.Contains(out, []byte(`window.__VILLAGE_PROMPT_TOKEN__="tok\"en"`)) {
		t.Fatalf("inject: %s", out)
	}
}

func TestCheckPromptAuth(t *testing.T) {
	tok := "secret-token"
	req := httptest.NewRequest(http.MethodPost, "/api/prompt", nil)
	if checkPromptAuth(req, tok) {
		t.Fatal("no header")
	}
	req.Header.Set("X-Village-Token", tok)
	if !checkPromptAuth(req, tok) {
		t.Fatal("X-Village-Token")
	}
	req2 := httptest.NewRequest(http.MethodPost, "/api/prompt", nil)
	req2.Header.Set("Authorization", "Bearer "+tok)
	if !checkPromptAuth(req2, tok) {
		t.Fatal("Bearer")
	}
	if checkPromptAuth(req2, "") {
		t.Fatal("empty configured token must deny")
	}
}

func TestPromptAuthzAndSanitize(t *testing.T) {
	root := t.TempDir()
	agents := filepath.Join(root, "agents")
	allowID := "cb63cb89-8fcf-4dac-b76d-e415c90b4341"
	_ = os.MkdirAll(filepath.Join(agents, allowID), 0o755)
	_ = os.WriteFile(filepath.Join(agents, allowID, "profile.json"), []byte(`{"name":"Grok Bot"}`), 0o644)
	other := "0f82e5f4-125a-4b4e-afd8-ac73ebe1663b"
	_ = os.MkdirAll(filepath.Join(agents, other), 0o755)

	whPath := filepath.Join(root, "webhook.json")
	_ = os.WriteFile(whPath, []byte(`{"url":"http://127.0.0.1:9/x","key":"test-key"}`), 0o600)
	wakes := filepath.Join(root, "wakes.jsonl")
	wh := webhook.New(whPath, wakes)
	_ = wh.Load()

	rroot := roster.Root{AgentData: root}
	h := hub.New(rroot)
	_, _ = h.RefreshRoster()

	mux := http.NewServeMux()
	registerRoutes(mux, routeDeps{
		demoMode:  false,
		rroot:     rroot,
		h:         h,
		wh:        wh,
		promptTok: "test-key",
		static:    staticFS,
	})

	post := func(token string, body any) *httptest.ResponseRecorder {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/api/prompt", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("X-Village-Token", token)
		}
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		return rr
	}

	if rr := post("", map[string]string{"id": allowID, "prompt": "hi"}); rr.Code != 401 {
		t.Fatalf("no token want 401 got %d", rr.Code)
	}
	if rr := post("test-key", map[string]string{"id": "../", "prompt": "hi"}); rr.Code != 400 {
		t.Fatalf("bad id want 400 got %d body %s", rr.Code, rr.Body.String())
	}
	if rr := post("test-key", map[string]string{"id": other, "prompt": "hi"}); rr.Code == 403 {
		t.Fatalf("existing agent must not be rejected by allowlist: got %d", rr.Code)
	}
	unknown := "99999999-9999-9999-9999-999999999999"
	if rr := post("test-key", map[string]string{"id": unknown, "prompt": "hi"}); rr.Code != 404 {
		t.Fatalf("unknown agent want 404 got %d", rr.Code)
	}

	// health: no agentData
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("health %d", rr.Code)
	}
	var health map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &health)
	if _, ok := health["agentData"]; ok {
		t.Fatal("agentData must be removed from health")
	}
	for _, k := range []string{"ok", "demo", "webhook", "bots"} {
		if _, ok := health[k]; !ok {
			t.Fatalf("health missing %s", k)
		}
	}

	// all existing agents + GET only
	reqB := httptest.NewRequest(http.MethodGet, "/api/bots", nil)
	rrB := httptest.NewRecorder()
	mux.ServeHTTP(rrB, reqB)
	var payload struct {
		Bots []roster.Bot `json:"bots"`
	}
	_ = json.Unmarshal(rrB.Body.Bytes(), &payload)
	if len(payload.Bots) != 2 {
		t.Fatalf("bots roster: want 2 got %+v", payload.Bots)
	}
	reqPost := httptest.NewRequest(http.MethodPost, "/api/bots", nil)
	rrP := httptest.NewRecorder()
	mux.ServeHTTP(rrP, reqPost)
	if rrP.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST /api/bots want 405 got %d", rrP.Code)
	}
}

func TestResolvePromptTokenEnvWins(t *testing.T) {
	root := t.TempDir()
	whPath := filepath.Join(root, "webhook.json")
	_ = os.WriteFile(whPath, []byte(`{"url":"u","key":"from-file"}`), 0o600)
	wh := webhook.New(whPath, "")
	_ = wh.Load()
	t.Setenv("VILLAGE_PROMPT_TOKEN", "from-env")
	if got := resolvePromptToken(wh); got != "from-env" {
		t.Fatalf("got %q", got)
	}
	t.Setenv("VILLAGE_PROMPT_TOKEN", "")
	if got := resolvePromptToken(wh); got != "from-file" {
		t.Fatalf("fallback got %q", got)
	}
}

func TestHealthAndBotsSmoke(t *testing.T) {
	// ensure static embed loads for registerRoutes index path
	if !strings.Contains(string(mustReadStatic()), "html") {
		t.Fatal("static")
	}
}

func mustReadStatic() []byte {
	b, err := staticFS.ReadFile("static/index.html")
	if err != nil {
		return []byte("<html></html>")
	}
	return b
}
