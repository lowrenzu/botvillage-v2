// Package snippets classifies transcript JSONL lines into activity kinds
// and extracts short plain-text snippets for speech bubbles.
package snippets

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf8"
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

// MaxBubbleRunes caps bubble text to match client truncation (~40–80).
const MaxBubbleRunes = 72

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
	Type  string          `json:"type"`
	Name  string          `json:"name"`
	Text  string          `json:"text"`
	Input json.RawMessage `json:"input"`
}

// ClassifyLine inspects one JSONL line and returns a Kind + role.
// Use SnippetText separately when a short bubble string is needed.
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

// IsExplicitIdle is true only for a real idle signal on the line
// (role/type/state/status is idle, inactive, or stopped). Unknown lines are not idle.
func IsExplicitIdle(line []byte) bool {
	line = trimSpace(line)
	if len(line) == 0 {
		return false
	}
	var env struct {
		Role   string `json:"role"`
		Type   string `json:"type"`
		State  string `json:"state"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(line, &env); err != nil {
		return false
	}
	for _, s := range []string{env.Role, env.Type, env.State, env.Status} {
		switch strings.ToLower(strings.TrimSpace(s)) {
		case "idle", "inactive", "stopped":
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

// secretish rejects snippets that look like keys/tokens/credentials.
var (
	secretKeyword = regexp.MustCompile(`(?i)(api[_-]?key|secret|password|passwd|token|bearer|authorization|private[_-]?key|BEGIN (RSA |EC |OPENSSH )?PRIVATE)`)
	longToken     = regexp.MustCompile(`(?i)\b(sk-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b`)
	hiddenPrompt  = regexp.MustCompile(`(?i)\[SAND_HIDDEN_PROMPT\]|^\[agent\]|SYSTEM PROMPT`)
)

// SnippetText pulls the first plain-text content part from a transcript JSONL
// line, sanitized and capped for speech bubbles. When there is no prose but a
// tool_use/tool_call is present, returns the concrete tool name (e.g. "Shell").
// Returns "" when nothing extractable (secrets, empty, or unparseable).
func SnippetText(line []byte) string {
	line = trimSpace(line)
	if len(line) == 0 {
		return ""
	}
	var env lineEnvelope
	if err := json.Unmarshal(line, &env); err != nil {
		return ""
	}
	raw := env.Message
	if len(raw) == 0 {
		// some shapes put content at top level
		raw = line
	}
	text := firstTextPart(raw)
	if s := cleanSnippet(text); s != "" {
		return s
	}
	// no prose — fall back to concrete tool/action name
	if name := firstToolName(raw); name != "" {
		return cleanSnippet(name)
	}
	return ""
}

func firstTextPart(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var msg messageBody
	if err := json.Unmarshal(raw, &msg); err == nil && len(msg.Content) > 0 {
		for _, p := range msg.Content {
			if p.Type == "text" || p.Type == "" {
				if t := strings.TrimSpace(p.Text); t != "" {
					return t
				}
			}
		}
		return ""
	}
	var parts []contentPart
	if err := json.Unmarshal(raw, &parts); err == nil {
		for _, p := range parts {
			if p.Type == "text" || p.Type == "" {
				if t := strings.TrimSpace(p.Text); t != "" {
					return t
				}
			}
		}
	}
	// rare: message is a bare string
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.TrimSpace(s)
	}
	return ""
}

func firstToolName(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	walk := func(parts []contentPart) string {
		for _, p := range parts {
			if p.Type == "tool_use" || p.Type == "tool_call" || p.Type == "function" {
				if n := strings.TrimSpace(p.Name); n != "" {
					return n
				}
			}
		}
		return ""
	}
	var msg messageBody
	if err := json.Unmarshal(raw, &msg); err == nil && len(msg.Content) > 0 {
		return walk(msg.Content)
	}
	var parts []contentPart
	if err := json.Unmarshal(raw, &parts); err == nil {
		return walk(parts)
	}
	return ""
}

func cleanSnippet(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	// collapse whitespace / strip newlines for bubble
	s = strings.Join(strings.Fields(s), " ")
	if s == "" {
		return ""
	}
	// skip internal/hidden prompts and secret-looking content
	if hiddenPrompt.MatchString(s) {
		return ""
	}
	if secretKeyword.MatchString(s) || longToken.MatchString(s) {
		return ""
	}
	if utf8.RuneCountInString(s) > MaxBubbleRunes {
		runes := []rune(s)
		s = string(runes[:MaxBubbleRunes-1]) + "…"
	}
	return s
}

// GenericChatter is deprecated for speech bubbles — prefer empty/hidden over
// invented status ("on it", "hey!"). Kept returning "" so old call sites stay safe.
func GenericChatter(kind Kind) string {
	_ = kind
	return ""
}

// GoalWord returns an honest truncated snippet from title/description
// (not a semantic "goal"). Prefer title; else first meaningful description text.
// Cap ~48 runes so HUD "Extrait" is readable without inventing objectives.
func GoalWord(title, description string) string {
	const max = 48
	clip := func(s string) string {
		s = strings.Join(strings.Fields(s), " ")
		if s == "" {
			return ""
		}
		r := []rune(s)
		if len(r) > max {
			return string(r[:max]) + "…"
		}
		return s
	}
	if t := strings.TrimSpace(title); t != "" {
		return clip(t)
	}
	d := strings.TrimSpace(description)
	if d == "" {
		return ""
	}
	// skip leading dashes/bullets noise
	fields := strings.Fields(d)
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		f = strings.Trim(f, "—–-•*,.")
		if len(f) < 2 || strings.HasPrefix(f, "http") {
			continue
		}
		out = append(out, f)
	}
	return clip(strings.Join(out, " "))
}

// ActionLine returns « Verbe · cible » only when this JSONL line is itself
// that action: a read path, an edit path, a fetched URL, or a search subject.
// Chat sentences and other tools return "" — never relabel them.
func ActionLine(line []byte) string {
	line = trimSpace(line)
	if len(line) == 0 {
		return ""
	}
	var env lineEnvelope
	if err := json.Unmarshal(line, &env); err != nil {
		return ""
	}
	raw := env.Message
	if len(raw) == 0 {
		raw = line
	}
	var msg messageBody
	if err := json.Unmarshal(raw, &msg); err != nil {
		var parts []contentPart
		if err2 := json.Unmarshal(raw, &parts); err2 != nil {
			return ""
		}
		msg.Content = parts
	}
	for _, part := range msg.Content {
		if s := actionFromPart(part); s != "" {
			return s
		}
	}
	return ""
}

func actionFromPart(p contentPart) string {
	if p.Type != "tool_use" && p.Type != "tool_call" {
		return ""
	}
	name := strings.ToLower(strings.TrimSpace(p.Name))
	var in map[string]any
	if len(p.Input) > 0 && json.Unmarshal(p.Input, &in) != nil {
		return ""
	}
	pick := func(keys ...string) string {
		for _, k := range keys {
			v, _ := in[k].(string)
			v = strings.Join(strings.Fields(v), " ")
			if v != "" {
				return v
			}
		}
		return ""
	}
	var verb, target string
	switch name {
	case "read", "read_file":
		verb, target = "Lit", pick("path", "file_path", "target_file")
	case "edit", "strreplace", "search_replace", "apply_patch", "write":
		verb, target = "Modifie", pick("path", "file_path", "target_file")
	case "web_fetch", "webfetch":
		verb, target = "Consulte", pick("url")
	case "web_search":
		verb, target = "Recherche", pick("search_term", "query")
	case "grep":
		verb, target = "Recherche", pick("pattern", "query")
	default:
		return ""
	}
	if verb == "" || target == "" {
		return ""
	}
	if hiddenPrompt.MatchString(target) || secretKeyword.MatchString(target) || longToken.MatchString(target) {
		return ""
	}
	s := verb + " · " + target
	if utf8.RuneCountInString(s) > MaxBubbleRunes {
		runes := []rune(s)
		s = string(runes[:MaxBubbleRunes-1]) + "…"
	}
	return s
}
