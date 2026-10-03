// Package skills lists SKILL.md names under AGENT_DATA (no skill bodies).
package skills

import (
	"bufio"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Skill is a catalog entry (id + display name + provenance).
type Skill struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Source string `json:"source"` // user | managed | plugin
}

// Root scans workflows, managed-skills, and plugins under AgentData.
type Root struct {
	AgentData string
}

// List returns skills ordered: user → managed → plugin. Dedupes by id (first wins).
func (r Root) List() []Skill {
	if strings.TrimSpace(r.AgentData) == "" {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]Skill, 0, 64)

	add := func(id, name, source string) {
		id = sanitizeID(id)
		if id == "" {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		name = strings.TrimSpace(name)
		if name == "" {
			name = id
		}
		out = append(out, Skill{ID: id, Name: name, Source: source})
	}

	// 1) User workflows: AGENT_DATA/workflows/*/SKILL.md
	wf := filepath.Join(r.AgentData, "workflows")
	entries, _ := os.ReadDir(wf)
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		path := filepath.Join(wf, e.Name(), "SKILL.md")
		if st, err := os.Stat(path); err != nil || st.IsDir() {
			continue
		}
		add(e.Name(), frontmatterName(path), "user")
	}

	// 2) Managed: AGENT_DATA/managed-skills/skills/*/SKILL.md
	ms := filepath.Join(r.AgentData, "managed-skills", "skills")
	entries, _ = os.ReadDir(ms)
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		path := filepath.Join(ms, e.Name(), "SKILL.md")
		if st, err := os.Stat(path); err != nil || st.IsDir() {
			continue
		}
		add(e.Name(), frontmatterName(path), "managed")
	}

	// 3) Plugins: AGENT_DATA/plugins/**/skills/**/SKILL.md
	plug := filepath.Join(r.AgentData, "plugins")
	_ = filepath.WalkDir(plug, func(path string, d os.DirEntry, err error) error {
		if err != nil || d == nil || d.IsDir() {
			return nil
		}
		if d.Name() != "SKILL.md" {
			return nil
		}
		// path .../skills/<id>/SKILL.md or .../skills/<id>/upstream/SKILL.md
		dir := filepath.Dir(path)
		base := filepath.Base(dir)
		id := base
		if base == "upstream" {
			id = filepath.Base(filepath.Dir(dir))
		}
		// require a "skills" ancestor
		if !hasSkillsAncestor(dir) {
			return nil
		}
		add(id, frontmatterName(path), "plugin")
		return nil
	})

	return out
}

func hasSkillsAncestor(dir string) bool {
	for {
		if filepath.Base(dir) == "skills" {
			return true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return false
		}
		dir = parent
	}
}

func sanitizeID(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || s == "." || s == ".." {
		return ""
	}
	return s
}

// frontmatterName reads only the YAML frontmatter "name:" field (first ~40 lines).
func frontmatterName(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 256*1024)
	inFM := false
	lines := 0
	for sc.Scan() {
		lines++
		if lines > 40 {
			break
		}
		line := sc.Text()
		trim := strings.TrimSpace(line)
		if !inFM {
			if trim == "---" {
				inFM = true
			}
			continue
		}
		if trim == "---" {
			break
		}
		if strings.HasPrefix(trim, "name:") {
			v := strings.TrimSpace(strings.TrimPrefix(trim, "name:"))
			v = strings.Trim(v, `"'`)
			return v
		}
	}
	return ""
}
