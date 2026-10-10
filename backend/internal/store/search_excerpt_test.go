package store

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"
)

func hits(parts []TextPart) []string {
	var out []string
	for _, p := range parts {
		if p.Hit {
			out = append(out, p.Text)
		}
	}
	return out
}

func joinParts(parts []TextPart) string {
	var sb strings.Builder
	for _, p := range parts {
		sb.WriteString(p.Text)
	}
	return sb.String()
}

func TestHighlightText(t *testing.T) {
	tests := []struct {
		name, text, query string
		want              []TextPart
	}{
		{"prefix, case-insensitive", "Lemur facts", "lem", []TextPart{{"Lemur", true}, {" facts", false}}},
		{"accents folded", "A Café stop", "cafe", []TextPart{{"A ", false}, {"Café", true}, {" stop", false}}},
		{"two words", "red panda and lemur", "panda lemur", []TextPart{{"red ", false}, {"panda", true}, {" and ", false}, {"lemur", true}}},
		{"no match", "plain title", "zebra", []TextPart{{"plain title", false}}},
		{"empty text", "", "zebra", []TextPart{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := highlightText(tt.text, foldedQueryWords(tt.query))
			if len(got) != len(tt.want) {
				t.Fatalf("got %+v, want %+v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("got %+v, want %+v", got, tt.want)
				}
			}
		})
	}
}

func TestExcerptParts(t *testing.T) {
	filler := strings.Repeat("alpha beta gamma delta ", 20)

	t.Run("html and entities stripped", func(t *testing.T) {
		html := `<p>Fish &amp; chips</p><script>var lemur=1</script><p>with <b>lemur</b> sauce</p>`
		parts := excerptParts(extractVisibleText(html), foldedQueryWords("lem"))
		if got := joinParts(parts); got != "Fish & chips with lemur sauce" {
			t.Fatalf("excerpt = %q", got)
		}
		if h := hits(parts); len(h) != 1 || h[0] != "lemur" {
			t.Fatalf("hits = %v", h)
		}
	})

	t.Run("hit near the end gets a leading ellipsis", func(t *testing.T) {
		parts := excerptParts(filler+"final lemur", foldedQueryWords("lem"))
		got := joinParts(parts)
		if !strings.HasPrefix(got, ellipsis) || strings.HasSuffix(got, ellipsis) {
			t.Fatalf("excerpt = %q", got)
		}
		if h := hits(parts); len(h) != 1 || h[0] != "lemur" {
			t.Fatalf("hits = %v", h)
		}
		if n := utf8.RuneCountInString(got); n > excerptLen+2 {
			t.Fatalf("excerpt too long: %d runes", n)
		}
	})

	t.Run("title-only match gives the start without hits", func(t *testing.T) {
		parts := excerptParts(filler, foldedQueryWords("lemur"))
		got := joinParts(parts)
		if len(hits(parts)) != 0 || !strings.HasPrefix(got, "alpha beta") || !strings.HasSuffix(got, ellipsis) {
			t.Fatalf("excerpt = %q", got)
		}
		if n := utf8.RuneCountInString(got); n < excerptLen-20 || n > excerptLen+2 {
			t.Fatalf("excerpt length = %d runes", n)
		}
	})

	t.Run("short text has no ellipsis", func(t *testing.T) {
		parts := excerptParts("tiny text", nil)
		if joinParts(parts) != "tiny text" {
			t.Fatalf("parts = %+v", parts)
		}
	})

	t.Run("empty text gives no parts", func(t *testing.T) {
		if parts := excerptParts("", nil); parts == nil || len(parts) != 0 {
			t.Fatalf("parts = %#v", parts)
		}
	})

	t.Run("two-word query bolds both", func(t *testing.T) {
		parts := excerptParts("The quick fox met a lemur", foldedQueryWords("fox lemur"))
		if h := hits(parts); len(h) != 2 || h[0] != "fox" || h[1] != "lemur" {
			t.Fatalf("hits = %v", h)
		}
	})
}

func TestSearchItemsFillsParts(t *testing.T) {
	store, _ := setupTestDB(t)
	defer closeStore(t, store)

	group := mustCreateGroup(t, store, "G")
	feed := mustCreateFeed(t, store, group.ID, "F", "https://example.com/f.xml", "https://example.com", "")
	mustCreateItem(t, store, feed.ID, "g-1", "Lemur Notes", "https://example.com/1", "<p>Visit the <b>Café</b> with a lemur.</p>", 100)
	mustCreateItem(t, store, feed.ID, "g-2", "Quiet day", "https://example.com/2", "", 50)

	results, err := store.SearchItems("lem cafe", 10)
	if err != nil {
		t.Fatalf("SearchItems() failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	r := results[0]
	if h := hits(r.TitleParts); len(h) != 1 || h[0] != "Lemur" {
		t.Errorf("title hits = %v", h)
	}
	if got := joinParts(r.ExcerptParts); got != "Visit the Café with a lemur." {
		t.Errorf("excerpt = %q", got)
	}
	if h := hits(r.ExcerptParts); len(h) != 2 || h[0] != "Café" || h[1] != "lemur" {
		t.Errorf("excerpt hits = %v", h)
	}

	// Empty content must serialize as [] rather than null.
	results, err = store.SearchItems("quiet", 10)
	if err != nil || len(results) != 1 {
		t.Fatalf("SearchItems(quiet) = %v, %v", results, err)
	}
	b, _ := json.Marshal(results[0])
	if !strings.Contains(string(b), `"excerpt_parts":[]`) {
		t.Errorf("json = %s", b)
	}
}
