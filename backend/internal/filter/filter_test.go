package filter

import (
	"strings"
	"testing"
)

func cond(trigger, op, value string) Condition {
	return Condition{Trigger: trigger, Operator: op, Value: value}
}

func rule(action, join string, whole bool, cs ...Condition) Rule {
	return Rule{Action: action, Join: join, WholeWords: whole, Conditions: cs}
}

func TestHidden(t *testing.T) {
	post := Item{
		Title: "Sponsored: Ten pans for your kitchen",
		Link:  "https://cookingblog.example/recipes/pasta-bake?ref=feed",
		HTML:  `<p>Bake the pasta.</p><img src="a.jpg">`,
		Text:  "Bake the pasta.",
	}
	plain := Item{
		Title: "Weeknight soup",
		Link:  "https://cookingblog.example/news/soup",
		HTML:  `<p>Simmer the soup.</p><iframe src="https://www.youtube.com/embed/x"></iframe>`,
		Text:  "Simmer the soup.",
	}

	tests := []struct {
		name string
		rule Rule
		item Item
		want bool
	}{
		{"remove title contains, ignoring case", rule("remove", "and", false, cond("title", "contains", "SPONSORED:")), post, true},
		{"remove title contains, no match", rule("remove", "and", false, cond("title", "contains", "SPONSORED:")), plain, false},
		{"keep recipes path hides other paths", rule("keep", "and", false, cond("url_path", "begins_with", "/recipes/")), plain, true},
		{"keep recipes path keeps recipes", rule("keep", "and", false, cond("url_path", "begins_with", "/recipes/")), post, false},
		{"url path includes query", rule("remove", "and", false, cond("url_path", "ends_with", "?ref=feed")), post, true},
		{"url path ignores domain", rule("remove", "and", false, cond("url_path", "contains", "cookingblog")), post, false},
		{"url contains domain", rule("remove", "and", false, cond("url", "contains", "cookingblog")), post, true},
		{"and needs all", rule("remove", "and", false, cond("title", "contains", "sponsored"), cond("title", "contains", "soup")), post, false},
		{"or needs one", rule("remove", "or", false, cond("title", "contains", "soup"), cond("title", "contains", "pans")), post, true},
		{"partial word matches when whole words is off", rule("remove", "and", false, cond("title", "contains", "pan")), post, true},
		{"partial word is rejected when whole words is on", rule("remove", "and", true, cond("title", "contains", "pan")), post, false},
		{"whole word accepts exact", rule("remove", "and", true, cond("title", "contains", "pans")), post, true},
		{"whole word finds later occurrence", rule("remove", "and", true, cond("title", "contains", "pan")), Item{Title: "Span of a pan"}, true},
		{"whole word begins with", rule("remove", "and", true, cond("title", "begins_with", "sponsor")), post, false},
		{"whole word ends with", rule("remove", "and", true, cond("title", "ends_with", "kitchen")), post, true},
		{"is ignores case", rule("remove", "and", false, cond("title", "is", "weeknight SOUP")), plain, true},
		{"is not", rule("remove", "and", false, cond("title", "is_not", "weeknight soup")), plain, false},
		{"not contains", rule("remove", "and", false, cond("title", "not_contains", "sponsored")), plain, true},
		{"regex ignores case", rule("remove", "and", false, cond("title", "regex", `^sponsored:\s`)), post, true},
		{"not regex", rule("remove", "and", false, cond("title", "not_regex", `^sponsored`)), post, false},
		{"content uses stripped text", rule("remove", "and", false, cond("content", "contains", "pasta")), post, true},
		{"content ignores markup", rule("remove", "and", false, cond("content", "contains", "<p>")), post, false},
		{"title or content hits content", rule("remove", "and", false, cond("title_or_content", "contains", "simmer")), plain, true},
		{"title or content not contains needs neither", rule("remove", "and", false, cond("title_or_content", "not_contains", "pasta")), post, false},
		{"has pictures", rule("remove", "and", false, cond("has_pictures", "", "")), post, true},
		{"has pictures none", rule("remove", "and", false, cond("has_pictures", "", "")), plain, false},
		{"no pictures", rule("remove", "and", false, cond("no_pictures", "", "")), plain, true},
		{"youtube iframe is video", rule("remove", "and", false, cond("has_video", "", "")), plain, true},
		{"no video", rule("remove", "and", false, cond("no_video", "", "")), post, true},
		{"other iframe is not video", rule("remove", "and", false, cond("has_video", "", "")), Item{HTML: `<iframe src="https://ads.example/x"></iframe>`}, false},
		{"video tag", rule("remove", "and", false, cond("has_video", "", "")), Item{HTML: `<video src="a.mp4"></video>`}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Hidden(tt.rule, tt.item); got != tt.want {
				t.Errorf("Hidden() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		rule    Rule
		wantErr string // empty = valid
	}{
		{"valid", rule("remove", "and", false, cond("title", "contains", "x")), ""},
		{"media needs no value", rule("keep", "or", false, cond("has_video", "", "")), ""},
		{"unknown action", rule("drop", "and", false, cond("title", "contains", "x")), "action"},
		{"unknown join", rule("remove", "xor", false, cond("title", "contains", "x")), "join"},
		{"no conditions", rule("remove", "and", false), "condition"},
		{"unknown trigger", rule("remove", "and", false, cond("title", "contains", "x"), cond("author", "contains", "x")), "condition 2"},
		{"unknown operator", rule("remove", "and", false, cond("title", "like", "x")), "condition 1"},
		{"empty value", rule("remove", "and", false, cond("title", "contains", "x"), cond("title", "contains", "x"), cond("url", "is", "  ")), "condition 3"},
		{"bad regex", rule("remove", "and", false, cond("title", "contains", "x"), cond("title", "regex", "(")), "condition 2"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Validate(tt.rule)
			switch {
			case tt.wantErr == "" && err != nil:
				t.Errorf("Validate() = %v, want nil", err)
			case tt.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tt.wantErr)):
				t.Errorf("Validate() = %v, want error containing %q", err, tt.wantErr)
			}
		})
	}
}
