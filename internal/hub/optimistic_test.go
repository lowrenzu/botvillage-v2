package hub

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"botvillage/internal/roster"
)

func TestPromptOptimisticNoTalk(t *testing.T) {
	root := t.TempDir()
	id := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	_ = os.MkdirAll(filepath.Join(root, "agents", id), 0o755)
	_ = os.WriteFile(filepath.Join(root, "agents", id, "profile.json"), []byte(`{"name":"T"}`), 0o644)
	h := New(roster.Root{AgentData: root})
	bots, err := h.RefreshRoster()
	if err != nil || len(bots) != 1 {
		t.Fatalf("roster: %v %+v", err, bots)
	}
	before := h.Bots()[0].State
	h.PromptOptimistic(id)
	after := h.Bots()[0].State
	if after != before {
		t.Fatalf("PromptOptimistic must not change state: before=%q after=%q", before, after)
	}
	if after == "talk" {
		t.Fatal("must not invent talk")
	}
	// No fake optimistic state: rollback must not force idle.
	h.PromptRollback(id)
	if h.Bots()[0].State != "idle" {
		t.Fatalf("rollback of real idle changed state to %s", h.Bots()[0].State)
	}

	h.mu.Lock()
	rt := h.bots[id]
	rt.gatewayHold = true
	rt.bot.State = "work"
	rt.fakeOptimistic = false
	h.mu.Unlock()
	h.PromptRollback(id)
	if got := h.Bots()[0].State; got != "work" {
		t.Fatalf("rollback overrode gateway work: %s", got)
	}

	h.mu.Lock()
	rt = h.bots[id]
	rt.gatewayHold = true
	rt.fakeOptimistic = true
	rt.bot.State = "talk"
	h.mu.Unlock()
	h.PromptRollback(id)
	if got := h.Bots()[0].State; got != "work" {
		t.Fatalf("fake rollback must restore gateway work, got %s", got)
	}

	h.mu.Lock()
	rt = h.bots[id]
	rt.gatewayHold = false
	rt.fakeOptimistic = true
	rt.preOptimistic = "idle"
	rt.bot.State = "talk"
	h.mu.Unlock()
	h.PromptRollback(id)
	if got := h.Bots()[0].State; got != "idle" {
		t.Fatalf("fake optimistic rollback want idle got %s", got)
	}
	_ = time.Now()
}
