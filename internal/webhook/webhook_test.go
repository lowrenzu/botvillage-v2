package webhook

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppendWakeRedactAndPerms(t *testing.T) {
	dir := t.TempDir()
	wakes := filepath.Join(dir, "wakes.jsonl")
	c := New(filepath.Join(dir, "missing.json"), wakes)
	long := make([]byte, 120)
	for i := range long {
		long[i] = 'a'
	}
	if err := c.appendWake(Payload{ID: "x", Name: "n", Prompt: string(long)}, 200, "ok"); err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(wakes)
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm() != 0o600 {
		t.Fatalf("want 0600 got %o", st.Mode().Perm())
	}
	b, _ := os.ReadFile(wakes)
	var rec map[string]any
	if err := json.Unmarshal(b[:len(b)-1], &rec); err != nil {
		t.Fatal(err)
	}
	p, _ := rec["prompt"].(string)
	if len([]rune(p)) > 81 { // 80 + ellipsis rune
		t.Fatalf("prompt not redacted: runes=%d bytes=%d", len([]rune(p)), len(p))
	}
	if !strings.HasSuffix(p, "…") {
		t.Fatalf("expected ellipsis suffix: %q", p)
	}
	if len(string(long)) <= 80 {
		t.Fatal("test setup")
	}
	c.EnsureWakesPerms()
}

func TestRedactPrompt(t *testing.T) {
	if redactPrompt("short") != "short" {
		t.Fatal("short")
	}
	s := make([]byte, 100)
	for i := range s {
		s[i] = 'b'
	}
	got := redactPrompt(string(s))
	if len([]rune(got)) != 81 || !strings.HasSuffix(got, "…") {
		t.Fatalf("got %q len %d", got, len(got))
	}
}
