package roster

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListOnlyAgentsDir(t *testing.T) {
	root := t.TempDir()
	agents := filepath.Join(root, "agents")
	if err := os.MkdirAll(filepath.Join(agents, "aaa-bot"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(agents, "bbb-bot"), 0o755); err != nil {
		t.Fatal(err)
	}
	// stray file should be ignored
	_ = os.WriteFile(filepath.Join(agents, "readme.txt"), []byte("x"), 0o644)
	// transcript-only id should NOT appear
	tr := filepath.Join(root, "agent-transcripts", "orphan", "orphan.jsonl")
	_ = os.MkdirAll(filepath.Dir(tr), 0o755)
	_ = os.WriteFile(tr, []byte("{}\n"), 0o644)

	prof := `{"name":"Alpha","title":"Scout","description":"maps the island","avatarColor":"green"}`
	_ = os.WriteFile(filepath.Join(agents, "aaa-bot", "profile.json"), []byte(prof), 0o644)
	_ = os.WriteFile(filepath.Join(agents, "aaa-bot", "chat.jsonl"), []byte(""), 0o644)

	r := Root{AgentData: root}
	bots, err := r.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(bots) != 2 {
		t.Fatalf("want 2 bots, got %d", len(bots))
	}
	var alpha *Bot
	for i := range bots {
		if bots[i].ID == "aaa-bot" {
			alpha = &bots[i]
		}
		if bots[i].ID == "orphan" {
			t.Fatal("orphan transcript id should not be listed")
		}
	}
	if alpha == nil {
		t.Fatal("missing aaa-bot")
	}
	if alpha.Name != "Alpha" || alpha.Title != "Scout" || alpha.Goal != "Scout" {
		t.Fatalf("profile not loaded: %+v", alpha)
	}
	if alpha.Transcript == "" {
		t.Fatal("expected transcript path under agents/")
	}
}

func TestTranscriptFallback(t *testing.T) {
	root := t.TempDir()
	id := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	_ = os.MkdirAll(filepath.Join(root, "agents", id), 0o755)
	tr := filepath.Join(root, "agent-transcripts", id, id+".jsonl")
	_ = os.MkdirAll(filepath.Dir(tr), 0o755)
	_ = os.WriteFile(tr, []byte(`{"role":"user"}`+"\n"), 0o644)

	r := Root{AgentData: root}
	p := r.TranscriptPath(id)
	if p != tr {
		t.Fatalf("want fallback %s got %s", tr, p)
	}
	if !r.Exists(id) {
		t.Fatal("Exists")
	}
	if r.Exists("nope") {
		t.Fatal("should not exist")
	}
}

func TestAvatarColorHexPriority(t *testing.T) {
	root := t.TempDir()
	id := "hex-bot"
	agents := filepath.Join(root, "agents", id)
	if err := os.MkdirAll(agents, 0o755); err != nil {
		t.Fatal(err)
	}
	prof := `{"name":"Pink","title":"QA","description":"sharp","avatarColor":"#ff8fb8"}`
	_ = os.WriteFile(filepath.Join(agents, "profile.json"), []byte(prof), 0o644)

	r := Root{AgentData: root}
	bots, err := r.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(bots) != 1 {
		t.Fatalf("want 1 bot, got %d", len(bots))
	}
	if bots[0].Color != "#ff8fb8" {
		t.Fatalf("want #ff8fb8 from profile, got %q", bots[0].Color)
	}
}

func TestResolveColorNamedAndHex(t *testing.T) {
	if got := resolveColor("#abc"); got != "#abc" {
		t.Fatalf("hex passthrough: %q", got)
	}
	if got := resolveColor("green"); got != "#5cb98f" {
		t.Fatalf("named green: %q", got)
	}
	if got := resolveColor(""); got != "#5e9bd6" {
		t.Fatalf("empty default: %q", got)
	}
}

func TestExistsSanitize(t *testing.T) {
	root := t.TempDir()
	id := "11111111-2222-3333-4444-555555555555"
	_ = os.MkdirAll(filepath.Join(root, "agents", id), 0o755)

	r := Root{AgentData: root}
	if !r.Exists(id) {
		t.Fatal("valid uuid should exist")
	}
	for _, bad := range []string{"../", "..", "foo/bar", `foo\bar`, "not-a-uuid", ""} {
		if r.Exists(bad) {
			t.Fatalf("must not exist: %q", bad)
		}
	}
	if r.Exists("99999999-9999-9999-9999-999999999999") {
		t.Fatal("unknown uuid must not exist")
	}
}

func TestSanitizeID(t *testing.T) {
	if SanitizeID("cb63cb89-8fcf-4dac-b76d-e415c90b4341") == "" {
		t.Fatal("valid")
	}
	if SanitizeID("../etc/passwd") != "" || SanitizeID("a/b") != "" || SanitizeID("") != "" {
		t.Fatal("invalid should clear")
	}
}

func TestFilterAllowed(t *testing.T) {
	bots := []Bot{{ID: "cb63cb89-8fcf-4dac-b76d-e415c90b4341"}, {ID: "deadbeef-dead-beef-dead-beefdeadbeef"}}
	out := FilterAllowed(bots, DefaultAllowlist)
	if len(out) != len(bots) {
		t.Fatalf("empty default allowlist must keep all bots, got %+v", out)
	}
	if !Allowed("cb63cb89-8fcf-4dac-b76d-e415c90b4341", DefaultAllowlist) ||
		!Allowed("deadbeef-dead-beef-dead-beefdeadbeef", DefaultAllowlist) {
		t.Fatal("empty default allowlist must allow all ids")
	}
	restricted := map[string]struct{}{"cb63cb89-8fcf-4dac-b76d-e415c90b4341": {}}
	out = FilterAllowed(bots, restricted)
	if len(out) != 1 || out[0].ID != "cb63cb89-8fcf-4dac-b76d-e415c90b4341" {
		t.Fatalf("restricted filter got %+v", out)
	}
	if Allowed("deadbeef-dead-beef-dead-beefdeadbeef", restricted) {
		t.Fatal("restricted filter allowed unexpected id")
	}
}

func TestExcludeFromEnv(t *testing.T) {
	id := "92eb4cb2-b322-465a-8c32-da3d95c2fd0c"
	if !Allowed(id, DefaultAllowlist) {
		t.Fatal("no VILLAGE_EXCLUDE must keep every agent")
	}
	t.Setenv("VILLAGE_EXCLUDE", id+", not-a-real")
	if Allowed(id, DefaultAllowlist) {
		t.Fatal("env exclude should hide id")
	}
	bots := []Bot{{ID: "cb63cb89-8fcf-4dac-b76d-e415c90b4341"}, {ID: id}}
	out := FilterAllowed(bots, DefaultAllowlist)
	if len(out) != 1 || out[0].ID != "cb63cb89-8fcf-4dac-b76d-e415c90b4341" {
		t.Fatalf("exclude filter got %+v", out)
	}
}
