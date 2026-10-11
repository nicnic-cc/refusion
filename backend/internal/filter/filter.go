// Package filter decides which articles a feed's filter hides. One matcher
// serves the live preview, the re-check on save and the pull of new articles,
// so all three always agree.
package filter

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/net/html"
)

const (
	ActionRemove = "remove"
	ActionKeep   = "keep"
	JoinAnd      = "and"
	JoinOr       = "or"
)

// Triggers say which part of the article a condition looks at.
const (
	TriggerTitle          = "title"
	TriggerContent        = "content"
	TriggerTitleOrContent = "title_or_content"
	TriggerURL            = "url"
	TriggerURLPath        = "url_path" // path and query, without the domain
	TriggerHasPictures    = "has_pictures"
	TriggerNoPictures     = "no_pictures"
	TriggerHasVideo       = "has_video"
	TriggerNoVideo        = "no_video"
)

const (
	OpContains    = "contains"
	OpNotContains = "not_contains"
	OpIs          = "is"
	OpIsNot       = "is_not"
	OpBeginsWith  = "begins_with"
	OpEndsWith    = "ends_with"
	OpRegex       = "regex"
	OpNotRegex    = "not_regex"
)

var textTriggers = map[string]bool{
	TriggerTitle: true, TriggerContent: true, TriggerTitleOrContent: true,
	TriggerURL: true, TriggerURLPath: true,
}

var mediaTriggers = map[string]bool{
	TriggerHasPictures: true, TriggerNoPictures: true,
	TriggerHasVideo: true, TriggerNoVideo: true,
}

var operators = map[string]bool{
	OpContains: true, OpNotContains: true, OpIs: true, OpIsNot: true,
	OpBeginsWith: true, OpEndsWith: true, OpRegex: true, OpNotRegex: true,
}

type Condition struct {
	Trigger  string `json:"trigger"`
	Operator string `json:"operator,omitempty"` // unused by the picture and video triggers
	Value    string `json:"value,omitempty"`
}

type Rule struct {
	Action     string      `json:"action"`
	Join       string      `json:"join"`
	WholeWords bool        `json:"whole_words"`
	Conditions []Condition `json:"conditions"`
}

// Item is what the matcher sees. Text is the HTML-stripped content (the same
// text strip_html indexes) and is only read when the rule NeedsText.
type Item struct {
	Title string
	Link  string
	HTML  string
	Text  string
}

// Validate reports the first invalid part of the rule; condition errors name
// the condition's 1-based position.
func Validate(r Rule) error {
	_, err := Compile(r)
	return err
}

// Matcher is a validated rule with its regexes compiled once.
type Matcher struct {
	rule     Rule
	regexes  []*regexp.Regexp // parallel to rule.Conditions, nil for non-regex
	needText bool
}

func Compile(r Rule) (*Matcher, error) {
	if r.Action != ActionRemove && r.Action != ActionKeep {
		return nil, fmt.Errorf("unknown action %q", r.Action)
	}
	if r.Join != JoinAnd && r.Join != JoinOr {
		return nil, fmt.Errorf("unknown join %q", r.Join)
	}
	if len(r.Conditions) == 0 {
		return nil, fmt.Errorf("at least one condition is required")
	}

	m := &Matcher{rule: r, regexes: make([]*regexp.Regexp, len(r.Conditions))}
	for i, c := range r.Conditions {
		n := i + 1
		switch {
		case mediaTriggers[c.Trigger]:
			continue
		case textTriggers[c.Trigger]:
		default:
			return nil, fmt.Errorf("condition %d: unknown trigger %q", n, c.Trigger)
		}
		if !operators[c.Operator] {
			return nil, fmt.Errorf("condition %d: unknown operator %q", n, c.Operator)
		}
		if strings.TrimSpace(c.Value) == "" {
			return nil, fmt.Errorf("condition %d: value is empty", n)
		}
		if c.Trigger == TriggerContent || c.Trigger == TriggerTitleOrContent {
			m.needText = true
		}
		if c.Operator == OpRegex || c.Operator == OpNotRegex {
			re, err := regexp.Compile("(?i)" + c.Value)
			if err != nil {
				return nil, fmt.Errorf("condition %d: invalid regex: %v", n, err)
			}
			m.regexes[i] = re
		}
	}
	return m, nil
}

// NeedsText tells callers whether Item.Text must be filled.
func (m *Matcher) NeedsText() bool { return m.needText }

// Hidden: Remove mode hides matches, Keep mode hides non-matches.
func (m *Matcher) Hidden(it Item) bool {
	matched := m.matches(it)
	if m.rule.Action == ActionKeep {
		return !matched
	}
	return matched
}

// Hidden compiles the rule per call; use Compile for many items.
func Hidden(r Rule, it Item) bool {
	m, err := Compile(r)
	if err != nil {
		return false
	}
	return m.Hidden(it)
}

func (m *Matcher) matches(it Item) bool {
	for i, c := range m.rule.Conditions {
		ok := m.conditionMatches(i, c, it)
		if m.rule.Join == JoinOr && ok {
			return true
		}
		if m.rule.Join == JoinAnd && !ok {
			return false
		}
	}
	return m.rule.Join == JoinAnd
}

func (m *Matcher) conditionMatches(i int, c Condition, it Item) bool {
	switch c.Trigger {
	case TriggerHasPictures:
		return scanMedia(it.HTML).pictures
	case TriggerNoPictures:
		return !scanMedia(it.HTML).pictures
	case TriggerHasVideo:
		return scanMedia(it.HTML).video
	case TriggerNoVideo:
		return !scanMedia(it.HTML).video
	}

	var texts []string
	switch c.Trigger {
	case TriggerTitle:
		texts = []string{it.Title}
	case TriggerContent:
		texts = []string{it.Text}
	case TriggerTitleOrContent:
		texts = []string{it.Title, it.Text}
	case TriggerURL:
		texts = []string{it.Link}
	case TriggerURLPath:
		texts = []string{urlWithoutDomain(it.Link)}
	}

	// Negative operators mean "no text matches", also across title or content.
	negative := c.Operator == OpNotContains || c.Operator == OpIsNot || c.Operator == OpNotRegex
	for _, t := range texts {
		if m.textMatches(i, c, t) {
			return !negative
		}
	}
	return negative
}

// textMatches applies the positive form of the condition's operator.
func (m *Matcher) textMatches(i int, c Condition, text string) bool {
	if c.Operator == OpRegex || c.Operator == OpNotRegex {
		return m.regexes[i].MatchString(text) // (?i) already ignores case
	}
	text = strings.ToLower(text)
	value := strings.ToLower(c.Value)
	switch c.Operator {
	case OpContains, OpNotContains:
		return contains(text, value, m.rule.WholeWords)
	case OpIs, OpIsNot:
		return text == value
	case OpBeginsWith:
		return strings.HasPrefix(text, value) &&
			(!m.rule.WholeWords || !isWordRune(firstRune(text[len(value):])))
	case OpEndsWith:
		return strings.HasSuffix(text, value) &&
			(!m.rule.WholeWords || !isWordRune(lastRune(text[:len(text)-len(value)])))
	}
	return false
}

func contains(text, value string, wholeWords bool) bool {
	if !wholeWords {
		return strings.Contains(text, value)
	}
	for from := 0; from <= len(text); {
		idx := strings.Index(text[from:], value)
		if idx < 0 {
			return false
		}
		start := from + idx
		end := start + len(value)
		if !isWordRune(lastRune(text[:start])) && !isWordRune(firstRune(text[end:])) {
			return true
		}
		from = start + 1
	}
	return false
}

func isWordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }

func firstRune(s string) rune {
	r, _ := utf8.DecodeRuneInString(s)
	return r
}

func lastRune(s string) rune {
	r, _ := utf8.DecodeLastRuneInString(s)
	return r
}

func urlWithoutDomain(link string) string {
	u, err := url.Parse(link)
	if err != nil {
		return link
	}
	return u.RequestURI()
}

type media struct{ pictures, video bool }

var videoHosts = []string{"youtube.com", "youtube-nocookie.com", "youtu.be", "vimeo.com"}

// scanMedia finds <img>, <video>, and YouTube or Vimeo iframes in raw HTML.
func scanMedia(src string) media {
	var found media
	z := html.NewTokenizer(strings.NewReader(src))
	for {
		tt := z.Next()
		if tt == html.ErrorToken {
			return found
		}
		if tt != html.StartTagToken && tt != html.SelfClosingTagToken {
			continue
		}
		name, hasAttr := z.TagName()
		switch string(name) {
		case "img":
			found.pictures = true
		case "video":
			found.video = true
		case "iframe":
			for hasAttr {
				var key, val []byte
				key, val, hasAttr = z.TagAttr()
				if string(key) == "src" && isVideoHost(string(val)) {
					found.video = true
				}
			}
		}
		if found.pictures && found.video {
			return found
		}
	}
}

func isVideoHost(src string) bool {
	u, err := url.Parse(strings.TrimSpace(src))
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, h := range videoHosts {
		if host == h || strings.HasSuffix(host, "."+h) {
			return true
		}
	}
	return false
}
