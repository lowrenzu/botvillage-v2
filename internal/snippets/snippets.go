// Package snippets classifies transcript JSONL lines into activity kinds
// without exposing real message text to the UI.
package snippets

import (
	"encoding/json"
	"strings"
)

// Kind is a coarse activity classification for village visuals.
type Kind string

const (
	KindUser   Kind = "user"
	KindTool   Kind = "tool"
	KindAssist Kind = "assistant"
	KindOther  Kind = "other"
	KindGrowth Kind = "growth" // any new line / file growth
)

// Event is a classified transcript event (no raw text).
type Event struct {
	AgentID string `json:"agentId"`
	Kind    Kind   `json:"kind"`
	Role    string `json:"role,omitempty"`
}

type lineEnvelope struct {
	Role    string          `json:"role"`
	Type    string          `json:"type"`
	Message json.RawMessage `json:"message"`
}

type messageBody struct {
	Content []contentPart `json:"content"`
}

type contentPart struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

// ClassifyLine inspects one JSONL line and returns a Kind + role.
// Real text is never returned.
func ClassifyLine(line []byte) (Kind, string) {
	line = trimSpace(line)
	if len(line) == 0 {
		return KindGrowth, ""
	}
	var env lineEnvelope
	if err := json.Unmarshal(line, &env); err != nil {
		return KindGrowth, ""
	}
	role := strings.ToLower(strings.TrimSpace(env.Role))
	if role == "" {
		role = strings.ToLower(strings.TrimSpace(env.Type))
	}

	switch role {
	case "user", "human":
		return KindUser, "user"
	case "tool", "function", "tool_result":
		return KindTool, "tool"
	case "assistant", "model", "ai":
		// tool_use inside assistant message counts as tool work
		if hasToolUse(env.Message) {
			return KindTool, "assistant"
		}
		return KindAssist, "assistant"
	default:
		if hasToolUse(env.Message) {
			return KindTool, role
		}
		if role != "" {
			return KindOther, role
		}
		return KindGrowth, ""
	}
}

func hasToolUse(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	var msg messageBody
	if err := json.Unmarshal(raw, &msg); err != nil {
		// also accept top-level content array
		var parts []contentPart
		if err2 := json.Unmarshal(raw, &parts); err2 != nil {
			s := string(raw)
			return strings.Contains(s, `"tool_use"`) || strings.Contains(s, `"tool_call"`)
		}
		for _, p := range parts {
			if p.Type == "tool_use" || p.Type == "tool_call" {
				return true
			}
		}
		return false
	}
	for _, p := range msg.Content {
		if p.Type == "tool_use" || p.Type == "tool_call" {
			return true
		}
	}
	return false
}

func trimSpace(b []byte) []byte {
	i, j := 0, len(b)
	for i < j && (b[i] == ' ' || b[i] == '\t' || b[i] == '\n' || b[i] == '\r') {
		i++
	}
	for j > i && (b[j-1] == ' ' || b[j-1] == '\t' || b[j-1] == '\n' || b[j-1] == '\r') {
		j--
	}
	return b[i:j]
}

// GenericChatter returns a safe bubble string keyed by kind (never real text).
func GenericChatter(kind Kind) string {
	switch kind {
	case KindUser:
		phrases := []string{"hey!", "got it", "listening", "mm?", "yo"}
		return phrases[len(kind)%len(phrases)]
	case KindTool:
		return "…"
	case KindAssist:
		return "on it"
	default:
		return "hmm"
	}
}

// GoalWord extracts a single short display word from title/description.
func GoalWord(title, description string) string {
	t := strings.TrimSpace(title)
	if t != "" {
		fields := strings.Fields(t)
		if len(fields) > 0 {
			w := fields[0]
			if len(w) > 16 {
				w = w[:16]
			}
			return w
		}
	}
	d := strings.TrimSpace(description)
	if d == "" {
		return ""
	}
	// first meaningful word, skip dashes/bullets
	for _, f := range strings.Fields(d) {
		f = strings.Trim(f, "—–-•*,.")
		if len(f) >= 2 && !strings.HasPrefix(f, "http") {
			if len(f) > 16 {
				f = f[:16]
			}
			return f
		}
	}
	return ""
}
