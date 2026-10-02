package snippets

import "testing"

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
	if g := GoalWord("Push hard", "desc"); g != "Push" {
		t.Fatalf("got %q", g)
	}
	if g := GoalWord("", "— motivateur généraliste"); g != "motivateur" {
		t.Fatalf("got %q", g)
	}
	if g := GoalWord("", ""); g != "" {
		t.Fatalf("got %q", g)
	}
}

func TestGenericChatterNoLeak(t *testing.T) {
	secret := "TOP_SECRET_PROMPT_XYZ"
	line := []byte(`{"role":"user","message":{"content":[{"type":"text","text":"` + secret + `"}]}}`)
	k, _ := ClassifyLine(line)
	chatter := GenericChatter(k)
	if chatter == secret || contains(chatter, "TOP_SECRET") {
		t.Fatalf("leaked: %q", chatter)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || (len(s) > 0 && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()))
}
