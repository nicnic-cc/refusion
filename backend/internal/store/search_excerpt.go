package store

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

const (
	excerptLen    = 150
	excerptLeadIn = 40
	ellipsis      = "…"
)

// TextPart is a run of text; Hit marks words that matched the search query.
// Pieces are sent instead of offsets because Go counts bytes and JS UTF-16 units.
type TextPart struct {
	Text string `json:"text"`
	Hit  bool   `json:"hit"`
}

// fillSearchParts sets the title and excerpt pieces; both are never nil so they
// serialize as [].
func fillSearchParts(r *SearchItemResult, content, query string) {
	words := foldedQueryWords(query)
	r.TitleParts = highlightText(r.Title, words)
	r.ExcerptParts = excerptParts(extractVisibleText(content), words)
}

// isWordRune approximates the words items_fts (unicode61) indexes.
func isWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.Is(unicode.Mn, r)
}

// foldWord lowercases and strips diacritics so "Café" and "cafe" compare equal.
func foldWord(w string) string {
	var sb strings.Builder
	for _, r := range norm.NFD.String(strings.ToLower(w)) {
		if !unicode.Is(unicode.Mn, r) {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

func foldedQueryWords(query string) []string {
	rs := []rune(query)
	words := []string{}
	for _, sp := range wordSpans(rs) {
		if f := foldWord(string(rs[sp[0]:sp[1]])); f != "" {
			words = append(words, f)
		}
	}
	return words
}

// wordSpans returns [start, end) rune offsets of each word.
func wordSpans(rs []rune) [][2]int {
	var spans [][2]int
	start := -1
	for i, r := range rs {
		switch {
		case isWordRune(r) && start < 0:
			start = i
		case !isWordRune(r) && start >= 0:
			spans = append(spans, [2]int{start, i})
			start = -1
		}
	}
	if start >= 0 {
		spans = append(spans, [2]int{start, len(rs)})
	}
	return spans
}

// hitMask marks, per rune, the words whose folded form starts with a query word
// (items_fts matches query terms as prefixes). It also returns the word spans.
func hitMask(rs []rune, queryWords []string) ([]bool, [][2]int) {
	mask := make([]bool, len(rs))
	spans := wordSpans(rs)
	if len(queryWords) == 0 {
		return mask, spans
	}
	for _, sp := range spans {
		folded := foldWord(string(rs[sp[0]:sp[1]]))
		for _, q := range queryWords {
			if strings.HasPrefix(folded, q) {
				for i := sp[0]; i < sp[1]; i++ {
					mask[i] = true
				}
				break
			}
		}
	}
	return mask, spans
}

func highlightText(text string, queryWords []string) []TextPart {
	rs := []rune(text)
	mask, _ := hitMask(rs, queryWords)
	return partsFromMask(rs, mask, false, false)
}

func excerptParts(text string, queryWords []string) []TextPart {
	rs := []rune(text)
	if len(rs) == 0 {
		return []TextPart{}
	}
	mask, spans := hitMask(rs, queryWords)

	start, firstHitEnd := 0, 0
	for _, sp := range spans {
		if mask[sp[0]] {
			start, firstHitEnd = max(0, sp[0]-excerptLeadIn), sp[1]
			break
		}
	}
	// Snap to word boundaries; the first hit word is never cut.
	for start > 0 && isWordRune(rs[start-1]) && isWordRune(rs[start]) {
		start--
	}
	for start < len(rs) && unicode.IsSpace(rs[start]) {
		start++
	}
	end := min(len(rs), start+excerptLen)
	if end < len(rs) && end > firstHitEnd {
		for end > start && isWordRune(rs[end-1]) && isWordRune(rs[end]) {
			end--
		}
	}
	for end > start && unicode.IsSpace(rs[end-1]) {
		end--
	}
	return partsFromMask(rs[start:end], mask[start:end], start > 0, end < len(rs))
}

// partsFromMask groups runes by hit flag, merging neighbours and never emitting
// empty pieces; cut ends get an "…" outside any hit.
func partsFromMask(rs []rune, mask []bool, leadEllipsis, trailEllipsis bool) []TextPart {
	parts := []TextPart{}
	add := func(text string, hit bool) {
		if text == "" {
			return
		}
		if n := len(parts); n > 0 && parts[n-1].Hit == hit {
			parts[n-1].Text += text
			return
		}
		parts = append(parts, TextPart{Text: text, Hit: hit})
	}
	if leadEllipsis {
		add(ellipsis, false)
	}
	from := 0
	for i := 1; i <= len(rs); i++ {
		if i == len(rs) || mask[i] != mask[from] {
			add(string(rs[from:i]), mask[from])
			from = i
		}
	}
	if trailEllipsis {
		add(ellipsis, false)
	}
	return parts
}
