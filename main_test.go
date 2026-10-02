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
	"time"

	"botvillage/internal/hub"
	"botvillage/internal/roster"
	"botvillage/internal/webhook"
)

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
		t.Fatal("empty token is not a header match")
	}
	local := httptest.NewRequest(http.MethodGet, "/api/bots", nil)
	local.RemoteAddr = "127.0.0.1:9"
	if !authorized(local, "secret-token") {
		t.Fatal("loopback must stay open")
	}
	remote := httptest.NewRequest(http.MethodGet, "/api/bots", nil)
	remote.RemoteAddr = "203.0.113.8:9"
	if authorized(remote, "secret-token") {
		t.Fatal("remote without token")
	}
	remote.Header.Set("X-Village-Token", "secret-token")
	if !authorized(remote, "secret-token") {
		t.Fatal("remote header")
	}
	t.Setenv("VILLAGE_LOCAL", "1")
	bare := httptest.NewRequest(http.MethodGet, "/api/bots", nil)
	bare.RemoteAddr = "203.0.113.8:9"
	if authorized(bare, "secret-token") {
		t.Fatal("VILLAGE_LOCAL must not authorize non-loopback without token")
	}
	loop := httptest.NewRequest(http.MethodGet, "/api/bots", nil)
	loop.RemoteAddr = "127.0.0.1:9"
	if !authorized(loop, "secret-token") {
		t.Fatal("loopback stays open under VILLAGE_LOCAL")
	}
	t.Setenv("VILLAGE_LOCAL", "")
}

func TestPromptAuthzAndSanitize(t *testing.T) {
	t.Setenv("VILLAGE_EXCLUDE", "")
	t.Setenv("VILLAGE_ALLOW", "")
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

	// health: no agentData (loopback ⇒ full payload)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.RemoteAddr = "127.0.0.1:1234"
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
	for _, k := range []string{"ok", "demo", "webhook", "bots", "grokBuild", "allowedIds"} {
		if _, ok := health[k]; !ok {
			t.Fatalf("health missing %s", k)
		}
	}

	// all existing agents + GET only
	reqB := httptest.NewRequest(http.MethodGet, "/api/bots", nil)
	reqB.RemoteAddr = "127.0.0.1:1234"
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
	reqPost.RemoteAddr = "127.0.0.1:1234"
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
	if got := resolvePromptToken(); got != "from-env" {
		t.Fatalf("got %q", got)
	}
	t.Setenv("VILLAGE_PROMPT_TOKEN", "")
	wd, _ := os.Getwd()
	t.Chdir(t.TempDir())
	defer t.Chdir(wd)
	if got := resolvePromptToken(); got != "" {
		t.Fatalf("empty env and no .prompt-token want empty, got %q", got)
	}
	_ = os.WriteFile(".prompt-token", []byte("from-file\n"), 0o600)
	if got := resolvePromptToken(); got != "from-file" {
		t.Fatalf(".prompt-token fallback got %q", got)
	}
	_ = wh
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

func TestIsGrokBuildTarget(t *testing.T) {
	cases := []struct {
		target, name, id string
		want             bool
	}{
		{"grok-build", "", "", true},
		{"GROK-BUILD", "Cursor", "x", true},
		{"", "grok", "x", true},
		{"", "Grok", "x", true},
		{"", "Grok Build", "x", true},
		{"", "grok build agent", "x", true},
		{"", "Grok Bot", "x", false},
		{"", "Bitchette", "x", false},
		{"", "Anything", grokBuildAgentID, true},
		{"", "Anything", "cb63cb89-8fcf-4dac-b76d-e415c90b4341", false},
		{"webhook", "Grok Build", "", true},
	}
	for _, c := range cases {
		got := isGrokBuildTarget(c.target, c.name, c.id)
		if got != c.want {
			t.Fatalf("isGrokBuildTarget(%q,%q,%q)=%v want %v", c.target, c.name, c.id, got, c.want)
		}
	}
}

func TestHealthScrubRemote(t *testing.T) {
	root := t.TempDir()
	agents := filepath.Join(root, "agents")
	_ = os.MkdirAll(filepath.Join(agents, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), 0o755)
	whPath := filepath.Join(root, "webhook.json")
	_ = os.WriteFile(whPath, []byte(`{"url":"http://127.0.0.1:9/x","key":"k"}`), 0o600)
	wh := webhook.New(whPath, filepath.Join(root, "wakes.jsonl"))
	_ = wh.Load()
	rroot := roster.Root{AgentData: root}
	h := hub.New(rroot)
	_, _ = h.RefreshRoster()
	mux := http.NewServeMux()
	registerRoutes(mux, routeDeps{
		rroot: rroot, h: h, wh: wh, promptTok: "sekrit", static: staticFS,
	})

	// loopback: full health
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.RemoteAddr = "127.0.0.1:9"
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	var full map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &full)
	for _, k := range []string{"ok", "demo", "webhook", "bots", "grokBuild", "allowedIds"} {
		if _, ok := full[k]; !ok {
			t.Fatalf("loopback health missing %s: %v", k, full)
		}
	}

	// remote unauth: scrubbed
	req2 := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req2.RemoteAddr = "203.0.113.8:9"
	rr2 := httptest.NewRecorder()
	mux.ServeHTTP(rr2, req2)
	var scrub map[string]any
	_ = json.Unmarshal(rr2.Body.Bytes(), &scrub)
	if scrub["ok"] != true {
		t.Fatalf("scrub ok: %v", scrub)
	}
	for _, k := range []string{"webhook", "grokBuild", "bots", "allowedIds", "demo"} {
		if _, ok := scrub[k]; ok {
			t.Fatalf("scrub must omit %s: %v", k, scrub)
		}
	}

	// remote with token: full
	req3 := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req3.RemoteAddr = "203.0.113.8:9"
	req3.Header.Set("X-Village-Token", "sekrit")
	rr3 := httptest.NewRecorder()
	mux.ServeHTTP(rr3, req3)
	var authd map[string]any
	_ = json.Unmarshal(rr3.Body.Bytes(), &authd)
	if _, ok := authd["webhook"]; !ok {
		t.Fatalf("authed remote should get full health: %v", authd)
	}
}

func TestOpaqueSessionCookie(t *testing.T) {
	root := t.TempDir()
	whPath := filepath.Join(root, "webhook.json")
	_ = os.WriteFile(whPath, []byte(`{"url":"http://127.0.0.1:9/x","key":"k"}`), 0o600)
	wh := webhook.New(whPath, "")
	_ = wh.Load()
	mux := http.NewServeMux()
	tok := "super-secret-token-value"
	registerRoutes(mux, routeDeps{
		rroot: roster.Root{AgentData: root}, h: hub.New(roster.Root{AgentData: root}),
		wh: wh, promptTok: tok, static: staticFS,
	})
	body, _ := json.Marshal(map[string]string{"token": tok})
	req := httptest.NewRequest(http.MethodPost, "/api/session", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Forwarded-Proto", "https")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("session login %d %s", rr.Code, rr.Body.String())
	}
	cookies := rr.Result().Cookies()
	var sid string
	for _, c := range cookies {
		if c.Name == "village_session" {
			sid = c.Value
			if c.Value == tok {
				t.Fatal("cookie must not be raw prompt token")
			}
			if !c.Secure {
				t.Fatal("Secure expected under X-Forwarded-Proto https")
			}
			if !c.HttpOnly {
				t.Fatal("HttpOnly")
			}
			if c.Expires.IsZero() {
				t.Fatal("Expires expected")
			}
		}
	}
	if sid == "" {
		t.Fatal("no village_session cookie")
	}
	remote := httptest.NewRequest(http.MethodGet, "/api/bots", nil)
	remote.RemoteAddr = "203.0.113.8:9"
	remote.AddCookie(&http.Cookie{Name: "village_session", Value: sid})
	if !authorized(remote, tok) {
		t.Fatal("opaque session cookie should authorize")
	}
	bad := httptest.NewRequest(http.MethodGet, "/api/bots", nil)
	bad.RemoteAddr = "203.0.113.8:9"
	bad.AddCookie(&http.Cookie{Name: "village_session", Value: tok})
	if authorized(bad, tok) {
		t.Fatal("raw token as cookie must NOT authorize")
	}
}

func TestPersistentSessionsRoundTripAndPrune(t *testing.T) {
	t.Chdir(t.TempDir())
	defer func() {
		sessionMu.Lock()
		sessionOK = map[string]time.Time{}
		sessionMu.Unlock()
	}()

	const liveID = "live-session"
	putSession(liveID)
	sessionMu.Lock()
	sessionOK = map[string]time.Time{}
	sessionMu.Unlock()
	if err := loadFromDisk(); err != nil {
		t.Fatalf("load persisted session: %v", err)
	}
	if !validSession(liveID) {
		t.Fatal("persisted session should survive an empty in-memory map")
	}

	expiredID := "expired-session"
	freshID := "fresh-session"
	stored := map[string]int64{
		expiredID: time.Now().Add(-time.Hour).Unix(),
		freshID:   time.Now().Add(time.Hour).Unix(),
	}
	b, _ := json.Marshal(stored)
	if err := os.WriteFile(sessionFile, b, 0o600); err != nil {
		t.Fatalf("write expired fixture: %v", err)
	}
	sessionMu.Lock()
	sessionOK = map[string]time.Time{}
	sessionMu.Unlock()
	if err := loadFromDisk(); err != nil {
		t.Fatalf("load and prune sessions: %v", err)
	}
	if validSession(expiredID) {
		t.Fatal("expired session should be pruned")
	}
	if !validSession(freshID) {
		t.Fatal("fresh session should remain after pruning")
	}
	var pruned map[string]int64
	b, err := os.ReadFile(sessionFile)
	if err != nil {
		t.Fatalf("read pruned sessions: %v", err)
	}
	if err := json.Unmarshal(b, &pruned); err != nil {
		t.Fatalf("decode pruned sessions: %v", err)
	}
	if _, ok := pruned[expiredID]; ok {
		t.Fatal("expired session remained on disk")
	}
}
