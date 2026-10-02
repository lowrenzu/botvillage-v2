package tail

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStartAtEOF(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.jsonl")
	if err := os.WriteFile(path, []byte("{\"role\":\"user\"}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	w := New()
	w.Coalesce = 20 * time.Millisecond
	w.Poll = 50 * time.Millisecond
	if err := w.Track("bot1", path); err != nil {
		t.Fatal(err)
	}
	off := w.SnapshotOffsets()[path]
	st, _ := os.Stat(path)
	if off != st.Size() {
		t.Fatalf("want EOF offset %d got %d", st.Size(), off)
	}
	// append
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.WriteString("{\"role\":\"tool\"}\n")
	_ = f.Close()

	got := w.ReadOnce(path)
	if len(got) != 1 {
		t.Fatalf("want 1 new line, got %d", len(got))
	}
	if got[0].AgentID != "bot1" {
		t.Fatalf("agent %s", got[0].AgentID)
	}
	if string(got[0].Data) != `{"role":"tool"}` {
		t.Fatalf("data %q", got[0].Data)
	}
}

func TestCoalesceBurst(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "b.jsonl")
	_ = os.WriteFile(path, nil, 0o644)
	w := New()
	w.Coalesce = 80 * time.Millisecond
	w.Poll = time.Hour // rely on manual ReadOnce + Run
	_ = w.Track("bot2", path)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	errCh := make(chan error, 1)
	go func() { errCh <- w.Run(ctx) }()

	time.Sleep(30 * time.Millisecond)
	f, _ := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	_, _ = f.WriteString("{\"role\":\"user\"}\n")
	_, _ = f.WriteString("{\"role\":\"assistant\"}\n")
	_, _ = f.WriteString("{\"role\":\"tool\"}\n")
	_ = f.Close()

	deadline := time.After(2 * time.Second)
	var lines []Line
	for len(lines) < 3 {
		select {
		case l := <-w.Events():
			lines = append(lines, l)
		case <-deadline:
			t.Fatalf("timeout, got %d lines", len(lines))
		}
	}
	cancel()
	if len(lines) != 3 {
		t.Fatalf("want 3 got %d", len(lines))
	}
}

func TestTruncateResets(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "c.jsonl")
	_ = os.WriteFile(path, []byte("old\n"), 0o644)
	w := New()
	_ = w.Track("bot3", path)
	_ = os.WriteFile(path, []byte("n\n"), 0o644) // truncate + rewrite
	got := w.ReadOnce(path)
	if len(got) != 1 || string(got[0].Data) != "n" {
		t.Fatalf("got %#v", got)
	}
}
