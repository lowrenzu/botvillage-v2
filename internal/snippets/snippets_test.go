package snippets

import (
	"strings"
	"testing"
)

func TestClassifyUser(t *testing.T) {
	line := []byte(`{"role":"user","message":{"content":[{"type":"text","text":"secret hello"}]}}`)
	k, role := ClassifyLine(line)
	if k != KindUser || role != "user" {
		t.Fatalf("got %s/%s", k, role)
	}
}

func TestClassifyToolUse(t *testing.T) {
	line := []byte(`{"role":"assistant","message":{"content":[{"type":"tool_use","name":"Shell"}]}}`)
	k, role := ClassifyLine(line)
	if k != KindTool || role != "assistant" {
		t.Fatalf("got %s/%s want tool/assistant", k, role)
	}
}

func TestClassifyToolRole(t *testing.T) {
	line := []byte(`{"role":"tool","message":{"content":[{"type":"tool_result"}]}}`)
	k, role := ClassifyLine(line)
	if k != KindTool || role != "tool" {
		t.Fatalf("got %s/%s", k, role)
	}
}

func TestClassifyAssist(t *testing.T) {
	line := []byte(`{"role":"assistant","message":{"content":[{"type":"text","text":"ok"}]}}`)
	k, role := ClassifyLine(line)
	if k != KindAssist || role != "assistant" {
		t.Fatalf("got %s/%s", k, role)
	}
}

func TestClassifyGarbage(t *testing.T) {
	k, role := ClassifyLine([]byte(`not json`))
	if k != KindGrowth || role != "" {
		t.Fatalf("got %s/%s", k, role)
	}
}

func TestGoalWord(t *testing.T) {
	if g := GoalWord("Push hard", "desc"); g != "Push hard" {
		t.Fatalf("got %q", g)
	}
	if g := GoalWord("", "— motivateur généraliste"); g != "motivateur généraliste" {
		t.Fatalf("got %q", g)
	}
	if g := GoalWord("", ""); g != "" {
		t.Fatalf("got %q", g)
	}
	long := strings.Repeat("ab ", 30)
	g := GoalWord(long, "")
	if !strings.HasSuffix(g, "…") || len([]rune(g)) > 49 {
		t.Fatalf("expected clipped snippet, got %q len=%d", g, len([]rune(g)))
	}
}

func TestGenericChatterEmpty(t *testing.T) {
	for _, k := range []Kind{KindUser, KindTool, KindAssist, KindOther, KindGrowth} {
		if got := GenericChatter(k); got != "" {
			t.Fatalf("GenericChatter(%s)=%q want empty", k, got)
		}
	}
}

func TestSnippetTextAssist(t *testing.T) {
	line := []byte(`{"role":"assistant","message":{"content":[{"type":"text","text":"Briefing reçu — je confirme."}]}}`)
	got := SnippetText(line)
	if got != "Briefing reçu — je confirme." {
		t.Fatalf("got %q", got)
	}
}

func TestSnippetTextToolUseName(t *testing.T) {
	line := []byte(`{"role":"assistant","message":{"content":[{"type":"tool_use","name":"Shell"}]}}`)
	if got := SnippetText(line); got != "Shell" {
		t.Fatalf("want Shell, got %q", got)
	}
}

func TestSnippetTextPrefersProseOverTool(t *testing.T) {
	line := []byte(`{"role":"assistant","message":{"content":[{"type":"text","text":"Opening files"},{"type":"tool_use","name":"Read"}]}}`)
	if got := SnippetText(line); got != "Opening files" {
		t.Fatalf("want prose, got %q", got)
	}
}

func TestSnippetTextCaps(t *testing.T) {
	long := ""
	for i := 0; i < 100; i++ {
		long += "a"
	}
	line := []byte(`{"role":"assistant","message":{"content":[{"type":"text","text":"` + long + `"}]}}`)
	got := SnippetText(line)
	r := []rune(got)
	if got == "" || len(r) > MaxBubbleRunes {
		t.Fatalf("bad cap: %q len=%d", got, len(r))
	}
	if r[len(r)-1] != '…' {
		t.Fatalf("expected ellipsis: %q", got)
	}
}

func TestSnippetTextHidesSecrets(t *testing.T) {
	line := []byte(`{"role":"assistant","message":{"content":[{"type":"text","text":"api_key=sk-abcdefghijklmnop"}]}}`)
	if got := SnippetText(line); got != "" {
		t.Fatalf("leaked secret snippet: %q", got)
	}
}

func TestSnippetTextHidesHiddenPrompt(t *testing.T) {
	line := []byte(`{"role":"user","message":{"content":[{"type":"text","text":"[SAND_HIDDEN_PROMPT][agent] secret system stuff"}]}}`)
	if got := SnippetText(line); got != "" {
		t.Fatalf("leaked hidden prompt: %q", got)
	}
}

func TestIsExplicitIdle(t *testing.T) {
	if IsExplicitIdle([]byte(`not json`)) || IsExplicitIdle([]byte(`{"type":"system","text":"ping"}`)) {
		t.Fatal("unknown line is not an idle signal")
	}
	if !IsExplicitIdle([]byte(`{"state":"idle"}`)) {
		t.Fatal("state=idle")
	}
	if !IsExplicitIdle([]byte(`{"status":"stopped"}`)) {
		t.Fatal("status=stopped")
	}
	if IsExplicitIdle([]byte(`{"role":"assistant","message":{"content":[{"type":"text","text":"idle later"}]}}`)) {
		t.Fatal("prose mentioning idle is not a signal")
	}
}
