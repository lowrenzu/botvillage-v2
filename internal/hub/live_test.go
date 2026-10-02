package hub

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"botvillage/internal/roster"
)

func TestDecodeGatewayAgentsFormats(t *testing.T) {
	arr := []byte(`[{"id":"a","name":"A","isRunning":true}]`)
	got, err := decodeGatewayAgents(bytes.NewReader(arr))
	if err != nil || len(got) != 1 || !got[0].IsRunning {
		t.Fatalf("array: %v %+v", err, got)
	}
	wrap := []byte(`{"agents":[{"id":"b","name":"B","isRunning":false,"isRunningTurn":true}]}`)
	got, err = decodeGatewayAgents(bytes.NewReader(wrap))
	if err != nil || len(got) != 1 || !got[0].IsRunningTurn {
		t.Fatalf("wrap: %v %+v", err, got)
	}
}

func TestSyncGatewayRunningAllBotsByIDAndName(t *testing.T) {
	dir := t.TempDir()
	agentsDir := filepath.Join(dir, "agents")
	for _, id := range []string{"uuid-grok", "uuid-elon", "uuid-bitch"} {
		if err := os.MkdirAll(filepath.Join(agentsDir, id), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	writeProfile := func(id, name string) {
		p := filepath.Join(agentsDir, id, "profile.json")
		if err := os.WriteFile(p, []byte(`{"name":"`+name+`"}`), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	writeProfile("uuid-grok", "Grok Bot")
	writeProfile("uuid-elon", "Elon Musk")
	writeProfile("uuid-bitch", "Bitchette")

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/listAgents" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode([]gatewayAgent{
			{ID: "uuid-grok", Name: "Grok Bot", IsRunning: true},
			{ID: "OTHER-uuid-elon", Name: "Elon Musk", IsRunning: true, IsRunningTurn: true},
			{ID: "uuid-bitch", Name: "Bitchette", IsRunning: false},
			{ID: "uuid-unknown", Name: "Stranger", IsRunning: true},
		})
	}))
	defer srv.Close()

	host, portStr := mustSplitHostPort(srv.Listener.Addr().String())
	raw, _ := json.Marshal(map[string]any{"port": mustAtoi(portStr), "host": host, "scheme": "http", "token": "t"})
	if err := os.WriteFile(filepath.Join(dir, "gateway.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	h := New(roster.Root{AgentData: dir})
	if _, err := h.RefreshRoster(); err != nil {
		t.Fatal(err)
	}
	h.mu.Lock()
	h.bots["uuid-bitch"].bot.State = "idle"
	h.bots["uuid-elon"].bot.State = "idle"
	h.bots["uuid-grok"].bot.State = "idle"
	h.mu.Unlock()

	h.SyncGatewayRunning()

	h.mu.Lock()
	defer h.mu.Unlock()
	if st := h.bots["uuid-grok"].bot.State; st != "work" {
		t.Fatalf("Grok Bot want work got %s", st)
	}
	if st := h.bots["uuid-elon"].bot.State; st != "work" {
		t.Fatalf("Elon (name match) want work got %s", st)
	}
	if !h.bots["uuid-grok"].gatewayHold || !h.bots["uuid-elon"].gatewayHold {
		t.Fatal("gatewayHold should be set for running bots")
	}
	if st := h.bots["uuid-bitch"].bot.State; st != "idle" {
		t.Fatalf("Bitchette not running should stay idle, got %s", st)
	}
}

func TestSyncGatewayRunningClearsWhenStopped(t *testing.T) {
	dir := t.TempDir()
	id := "uuid-build"
	if err := os.MkdirAll(filepath.Join(dir, "agents", id), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "agents", id, "profile.json"), []byte(`{"name":"Grok Build"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	running := true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]gatewayAgent{
			{ID: id, Name: "Grok Build", IsRunning: running},
		})
	}))
	defer srv.Close()
	host, portStr := mustSplitHostPort(srv.Listener.Addr().String())
	raw, _ := json.Marshal(map[string]any{"port": mustAtoi(portStr), "host": host, "scheme": "http"})
	if err := os.WriteFile(filepath.Join(dir, "gateway.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	h := New(roster.Root{AgentData: dir})
	if _, err := h.RefreshRoster(); err != nil {
		t.Fatal(err)
	}
	h.SyncGatewayRunning()
	h.mu.Lock()
	if h.bots[id].bot.State != "work" {
		h.mu.Unlock()
		t.Fatal("expected work while running")
	}
	h.mu.Unlock()

	running = false
	h.SyncGatewayRunning()
	h.mu.Lock()
	if h.bots[id].bot.State != "idle" {
		t.Fatalf("expected idle after stop, got %s", h.bots[id].bot.State)
	}
	if h.bots[id].gatewayHold {
		t.Fatal("gatewayHold should clear")
	}

	// Gateway not busy wins: even long transcript until must not sticky-work.
	h.bots[id].bot.State = "work"
	h.bots[id].gatewayHold = true
	h.bots[id].until = time.Now().Add(transcriptWorkHold)
	h.mu.Unlock()
	h.SyncGatewayRunning()
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.bots[id].bot.State != "idle" {
		t.Fatalf("gateway stop must clear work immediately, got %s", h.bots[id].bot.State)
	}
}

func mustSplitHostPort(addr string) (string, string) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return addr, ""
	}
	return host, port
}

func mustAtoi(s string) int {
	n := 0
	for _, c := range s {
		n = n*10 + int(c-'0')
	}
	return n
}
