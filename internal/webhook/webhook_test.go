package webhook

import (
	"encoding/json"
	"os"
	"path/filepath"
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
	if _, ok := rec["prompt"]; ok {
		t.Fatal("prompt plaintext must not be stored")
	}
	n, _ := rec["promptLen"].(float64)
	if int(n) != len(long) {
		t.Fatalf("promptLen %v", rec["promptLen"])
	}
	c.EnsureWakesPerms()
}

func TestRedactPrompt(t *testing.T) {
	if redactPrompt("") != "" || redactPrompt("   ") != "" {
		t.Fatal("empty")
	}
	if redactPrompt("secret consigne") != "" {
		t.Fatal("plaintext leaked")
	}
}
