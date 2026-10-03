package grokbuild

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFromEnvConfigured(t *testing.T) {
	t.Setenv("XAI_API_KEY", "")
	empty := FromEnv("")
	if empty.Configured() {
		t.Fatal("empty key must not be configured")
	}

	t.Setenv("XAI_API_KEY", "test-key")
	c := FromEnv("")
	if !c.Configured() || c.Key != "test-key" {
		t.Fatalf("env key: %+v", c)
	}
	if c.HTTP == nil {
		t.Fatal("HTTP client required")
	}

	t.Setenv("XAI_API_KEY", "")
	dir := t.TempDir()
	path := filepath.Join(dir, "xai.json")
	if err := os.WriteFile(path, []byte(`{"key":"file-key"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	fc := FromEnv(path)
	if !fc.Configured() || fc.Key != "file-key" {
		t.Fatalf("file key: %+v", fc)
	}
}

func TestReplyMissingKey(t *testing.T) {
	c := Client{}
	if _, err := c.Reply("hi"); err == nil {
		t.Fatal("expected missing key error")
	}
}
