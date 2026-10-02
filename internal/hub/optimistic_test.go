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
	// Rollback stays harmless
	h.PromptRollback(id)
	_ = time.Now()
	if h.Bots()[0].State != "idle" {
		t.Fatalf("rollback → idle, got %s", h.Bots()[0].State)
	}
}
