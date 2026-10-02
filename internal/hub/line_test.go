package hub

import (
	"os"
	"path/filepath"
	"testing"

	"botvillage/internal/roster"
	"botvillage/internal/tail"
)

func TestHandleLineUnknownDoesNotWalk(t *testing.T) {
	root := t.TempDir()
	id := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	_ = os.MkdirAll(filepath.Join(root, "agents", id), 0o755)
	_ = os.WriteFile(filepath.Join(root, "agents", id, "profile.json"), []byte(`{"name":"T"}`), 0o644)
	h := New(roster.Root{AgentData: root})
	if _, err := h.RefreshRoster(); err != nil {
		t.Fatal(err)
	}
	h.mu.Lock()
	h.bots[id].bot.State = "talk"
	h.mu.Unlock()

	h.HandleLine(tail.Line{AgentID: id, Data: []byte(`{"type":"system","text":"ping"}`)})
	if got := h.Bots()[0].State; got != "talk" {
		t.Fatalf("unknown line changed state to %q", got)
	}
	h.HandleLine(tail.Line{AgentID: id, Data: []byte("not json")})
	if got := h.Bots()[0].State; got != "talk" {
		t.Fatalf("garbage line changed state to %q", got)
	}
	for _, st := range []string{"walk", "work", "talk"} {
		if h.Bots()[0].State == st && st != "talk" {
			t.Fatalf("invented %s", st)
		}
	}

	h.HandleLine(tail.Line{AgentID: id, Data: []byte(`{"state":"idle"}`)})
	if got := h.Bots()[0].State; got != "idle" {
		t.Fatalf("explicit idle signal: got %q", got)
	}

	h.mu.Lock()
	h.bots[id].bot.State = "work"
	h.bots[id].gatewayHold = true
	h.mu.Unlock()
	h.HandleLine(tail.Line{AgentID: id, Data: []byte(`{"state":"idle"}`)})
	if got := h.Bots()[0].State; got != "work" {
		t.Fatalf("idle signal must not override gateway work, got %q", got)
	}
}
