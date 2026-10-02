// Package roster discovers Grok Bot agents under AGENT_DATA/agents/.
package roster

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"botvillage/internal/snippets"
)

// Bot is a villager on the island.
type Bot struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Title     string    `json:"title"`
	Goal      string    `json:"goal"`
	Color     string    `json:"color"`
	HasAvatar bool      `json:"hasAvatar"`
	LastRole  string    `json:"lastRole"`
	State     string    `json:"state"` // idle|walk|work|talk|zzz
	HomeX     float64   `json:"homeX"`
	HomeY     float64   `json:"homeY"`
	X         float64   `json:"x"`
	Y         float64   `json:"y"`
	Updated   time.Time `json:"updated"`
	// Transcript path if jsonl exists; empty ⇒ no live activity feed.
	Transcript string `json:"-"`
	// HasTranscript is true when a transcript jsonl exists and is non-empty.
	HasTranscript bool `json:"hasTranscript"`
}

type profileJSON struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	AvatarColor string `json:"avatarColor"`
}

// Root holds AGENT_DATA path (parent of agents/).
type Root struct {
	AgentData string
}

func (r Root) AgentsDir() string {
	return filepath.Join(r.AgentData, "agents")
}

func (r Root) TranscriptsDir() string {
	return filepath.Join(r.AgentData, "agent-transcripts")
}

// List returns bots for directories under agents/ (skip non-dirs / dotfiles).
func (r Root) List() ([]Bot, error) {
	dir := r.AgentsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var bots []Bot
	idx := 0
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		// skip obvious non-agent dirs
		if name == "assets" || name == "attachments" {
			continue
		}
		if !Allowed(name, AllowSet()) {
			continue
		}
		b := r.loadBot(name, idx)
		bots = append(bots, b)
		idx++
	}
	sort.Slice(bots, func(i, j int) bool { return bots[i].Name < bots[j].Name })
	// reassign home slots after sort for stable layout
	for i := range bots {
		hx, hy := homeSlot(i)
		bots[i].HomeX, bots[i].HomeY = hx, hy
		if bots[i].X == 0 && bots[i].Y == 0 {
			bots[i].X, bots[i].Y = hx, hy
		}
	}
	return bots, nil
}

func (r Root) loadBot(id string, idx int) Bot {
	hx, hy := homeSlot(idx)
	b := Bot{
		ID:      id,
		Name:    shortID(id),
		Title:   "",
		Goal:    "",
		Color:   colorFor(id),
		State:   "idle",
		HomeX:   hx,
		HomeY:   hy,
		X:       hx,
		Y:       hy,
		Updated: time.Now(),
	}
	profPath := filepath.Join(r.AgentsDir(), id, "profile.json")
	if data, err := os.ReadFile(profPath); err == nil {
		var p profileJSON
		if json.Unmarshal(data, &p) == nil {
			if strings.TrimSpace(p.Name) != "" {
				b.Name = strings.TrimSpace(p.Name)
			}
			b.Title = strings.TrimSpace(p.Title)
			b.Goal = snippets.GoalWord(p.Title, p.Description)
			if c := strings.TrimSpace(p.AvatarColor); c != "" {
				b.Color = resolveColor(c) // profile avatarColor wins; #hex kept as-is
			}
		}
	}
	b.HasAvatar = false
	for _, name := range []string{"avatar.png", "avatar.jpg", "avatar.jpeg", "avatar.webp"} {
		if _, err := os.Stat(filepath.Join(r.AgentsDir(), id, name)); err == nil {
			b.HasAvatar = true
			break
		}
	}
	b.Transcript = r.findTranscript(id)
	b.HasTranscript = transcriptNonempty(b.Transcript)
	return b
}

// findTranscript prefers agents/{id}/*.jsonl then agent-transcripts/{id}/{id}.jsonl.
func (r Root) findTranscript(id string) string {
	agentDir := filepath.Join(r.AgentsDir(), id)
	matches, _ := filepath.Glob(filepath.Join(agentDir, "*.jsonl"))
	sort.Strings(matches)
	for _, m := range matches {
		base := filepath.Base(m)
		if strings.HasPrefix(base, "wakes") {
			continue
		}
		return m
	}
	// common names
	for _, name := range []string{"transcript.jsonl", "chat.jsonl", id + ".jsonl"} {
		p := filepath.Join(agentDir, name)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	// live layout fallback: agent-transcripts/{id}/{id}.jsonl (only if agent exists)
	cand := filepath.Join(r.TranscriptsDir(), id, id+".jsonl")
	if st, err := os.Stat(cand); err == nil && !st.IsDir() {
		return cand
	}
	return ""
}

// TranscriptPath returns the path for an agent id (may be empty).
func (r Root) TranscriptPath(id string) string {
	return r.findTranscript(id)
}

// transcriptNonempty reports whether path exists and has size > 0.
func transcriptNonempty(path string) bool {
	if path == "" {
		return false
	}
	st, err := os.Stat(path)
	return err == nil && !st.IsDir() && st.Size() > 0
}

func homeSlot(i int) (float64, float64) {
	// 480x270 map; keep homes on land ring around center
	slots := [][2]float64{
		{70, 90}, {120, 70}, {180, 60}, {250, 65}, {320, 75}, {380, 95},
		{60, 150}, {110, 170}, {170, 185}, {240, 190}, {310, 180}, {370, 160},
		{90, 120}, {200, 110}, {300, 125}, {350, 140},
	}
	s := slots[i%len(slots)]
	return s[0], s[1]
}

func shortID(id string) string {
	if len(id) <= 8 {
		return id
	}
	return id[:8]
}

// namedPalette mirrors web/src/sim.ts NAMED — API returns hex for distinct client colors.
var namedPalette = map[string]string{
	"yellow":  "#c9a84a",
	"magenta": "#b87a9e",
	"orange":  "#c48a5a",
	"blue":    "#5e9bd6",
	"green":   "#5cb98f",
	"kaki":    "#8a9260",
	"black":   "#4a4d53",
	"cyan":    "#58b3ab",
	"red":     "#b87878",
	"purple":  "#8e82b0",
}

// resolveColor keeps #hex as-is; maps named palette tokens to hex.
func resolveColor(c string) string {
	c = strings.TrimSpace(c)
	if c == "" {
		return "#5e9bd6"
	}
	if strings.HasPrefix(c, "#") {
		return c
	}
	if h, ok := namedPalette[strings.ToLower(c)]; ok {
		return h
	}
	return c
}

func colorFor(id string) string {
	palette := []string{"yellow", "magenta", "orange", "blue", "green", "kaki", "black", "cyan", "red", "purple"}
	h := 0
	for _, c := range id {
		h = h*31 + int(c)
	}
	if h < 0 {
		h = -h
	}
	return resolveColor(palette[h%len(palette)])
}

// Exists reports whether agents/{id} is a directory.
// Invalid ids (path traversal, non-UUID-like) are treated as not existing.
func (r Root) Exists(id string) bool {
	id = SanitizeID(id)
	if id == "" {
		return false
	}
	st, err := os.Stat(filepath.Join(r.AgentsDir(), id))
	return err == nil && st.IsDir()
}
