// Package demo seeds 10–12 fake bots and appends JSONL activity.
package demo

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"time"
)

type seedBot struct {
	ID    string
	Name  string
	Title string
	Desc  string
	Color string
}

var seeds = []seedBot{
	{"demo-mini", "Mini Moi", "Hub", "routes the island", "#c48a5a"},
	{"demo-elon", "Elon Musk", "Push", "first principles push", "#5e9bd6"},
	{"demo-bitch", "Bitchette", "QA", "piques short and sharp", "#ff8fb8"},
	{"demo-scout", "Scout", "Maps", "charts the fog", "kaki"},
	{"demo-list", "Listings", "Ads", "lists homes", "blue"},
	{"demo-pike", "PIKE", "Fish", "casts the line", "green"},
	{"demo-atelier", "Atelier Sims", "Art", "paints the walls", "purple"},
	{"demo-egg", "eggbot", "Eggs", "keeps the coop", "yellow"},
	{"demo-forge", "Forge", "Smith", "hammers steel", "red"},
	{"demo-sage", "Sage", "Lore", "reads old scrolls", "cyan"},
	{"demo-herald", "Herald", "News", "rings the bell", "blue"},
	{"demo-keeper", "Keeper", "Gate", "watches the wall", "black"},
}

// Setup creates agents + empty JSONL under agentData/agents/. Returns agent count.
func Setup(agentData string) (int, error) {
	agents := filepath.Join(agentData, "agents")
	if err := os.MkdirAll(agents, 0o755); err != nil {
		return 0, err
	}
	for _, s := range seeds {
		dir := filepath.Join(agents, s.ID)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return 0, err
		}
		prof := map[string]string{
			"name":        s.Name,
			"title":       s.Title,
			"description": s.Desc,
			"avatarColor": s.Color,
		}
		b, _ := json.MarshalIndent(prof, "", "  ")
		if err := os.WriteFile(filepath.Join(dir, "profile.json"), append(b, '\n'), 0o644); err != nil {
			return 0, err
		}
		tr := filepath.Join(dir, s.ID+".jsonl")
		if _, err := os.Stat(tr); os.IsNotExist(err) {
			if err := os.WriteFile(tr, nil, 0o644); err != nil {
				return 0, err
			}
		}
	}
	return len(seeds), nil
}

// Run appends synthetic JSONL lines until ctx done.
func Run(ctx context.Context, agentData string) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	t := time.NewTicker(900 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s := seeds[rng.Intn(len(seeds))]
			path := filepath.Join(agentData, "agents", s.ID, s.ID+".jsonl")
			line := fakeLine(rng, s)
			f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o644)
			if err != nil {
				continue
			}
			_, _ = f.Write(append(line, '\n'))
			_ = f.Close()
		}
	}
}

func fakeLine(rng *rand.Rand, s seedBot) []byte {
	roll := rng.Intn(10)
	var obj any
	switch {
	case roll < 3:
		obj = map[string]any{
			"role": "user",
			"message": map[string]any{
				"content": []map[string]string{{"type": "text", "text": "demo user ping"}},
			},
		}
	case roll < 7:
		obj = map[string]any{
			"role": "assistant",
			"message": map[string]any{
				"content": []map[string]any{
					{"type": "tool_use", "name": pickTool(rng)},
				},
			},
		}
	default:
		obj = map[string]any{
			"role": "assistant",
			"message": map[string]any{
				"content": []map[string]string{{"type": "text", "text": fmt.Sprintf("%s thinks", s.Name)}},
			},
		}
	}
	b, _ := json.Marshal(obj)
	return b
}

func pickTool(rng *rand.Rand) string {
	tools := []string{"Shell", "Read", "WebSearch", "CallMcpTool", "Write"}
	return tools[rng.Intn(len(tools))]
}
