package skills

import (
	"os"
	"path/filepath"
	"testing"
)

func TestListOrderAndFrontmatter(t *testing.T) {
	root := t.TempDir()
	mustWrite := func(rel, body string) {
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	mustWrite("workflows/alpha/SKILL.md", "---\nname: Alpha Skill\ndescription: x\n---\n# secret body\n")
	mustWrite("managed-skills/skills/beta/SKILL.md", "---\nname: Beta\n---\n")
	mustWrite("managed-skills/skills/gamma/SKILL.md", "# no fm\n")
	mustWrite("plugins/cache/foo/skills/delta/SKILL.md", "---\nname: Delta Plug\n---\n")
	mustWrite("plugins/cache/bar/skills/eps/upstream/SKILL.md", "---\nname: Epsilon\n---\n")

	list := Root{AgentData: root}.List()
	if len(list) != 5 {
		t.Fatalf("want 5 got %d %#v", len(list), list)
	}
	if list[0].Source != "user" || list[0].Name != "Alpha Skill" || list[0].ID != "alpha" {
		t.Fatalf("user first: %+v", list[0])
	}
	if list[1].Source != "managed" || list[1].ID != "beta" {
		t.Fatalf("managed: %+v", list[1])
	}
	if list[2].ID != "gamma" || list[2].Name != "gamma" {
		t.Fatalf("fallback name: %+v", list[2])
	}
	ids := map[string]string{}
	for _, s := range list {
		ids[s.ID] = s.Source
	}
	if ids["delta"] != "plugin" || ids["eps"] != "plugin" {
		t.Fatalf("plugins: %v", ids)
	}
}

func TestEmptyRoot(t *testing.T) {
	if len(Root{}.List()) != 0 {
		t.Fatal("empty")
	}
}
