package webpage

import (
	"strings"
	"testing"
)

// CSS nesting selectors must survive InjectStyle: `&` in selector position
// stays a delimiter and is not rewritten to the identifier escape `\26 `.
func TestReproEscapeCSSNestingSelector(t *testing.T) {
	const page = "<html><body>x</body></html>"
	tests := []struct{ name, css, want string }{
		{"control: no ampersand", `.a{color:red}`, `.a{color:red}`},
		{"descendant nesting", `.a{& p{color:red}}`, `& p`},
		{"pseudo nesting", `.a{&:hover{x:y}}`, `&:hover`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := string(InjectStyle([]byte(page), tt.css))
			if !strings.Contains(out, tt.want) {
				t.Fatalf("want %q in %q", tt.want, out)
			}
			if strings.Contains(out, `\26`) {
				t.Fatalf("selector & became identifier escape in %q", out)
			}
		})
	}
}

// An existing backslash escape before `&` or a non-ASCII rune must not turn
// into an escaped backslash plus literal hex text.
func TestReproEscapeCSSKeepsExistingEscape(t *testing.T) {
	t.Run("control: escaped backslash then ampersand", func(t *testing.T) {
		got := escapeCSS(`.a\\&b{}`)
		if !strings.HasPrefix(got, `.a\\`) {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("escaped ampersand", func(t *testing.T) {
		got := escapeCSS(`.a\&b{}`)
		if strings.Contains(got, `\\26`) {
			t.Fatalf("got %q", got)
		}
		if !strings.Contains(got, `\&`) && !strings.Contains(got, `\26 b`) {
			t.Fatalf("escape lost in %q", got)
		}
	})

	t.Run("escaped non-ascii", func(t *testing.T) {
		got := escapeCSS(`.caf\é{}`)
		if strings.Contains(got, `\\e9`) {
			t.Fatalf("got %q", got)
		}
	})
}

// C0 controls other than tab, LF and CR are invalid in XML 1.0 and must not
// pass through into an XHTML copy.
func TestReproEscapeCSSControlChars(t *testing.T) {
	t.Run("control: tab, LF, CR stay", func(t *testing.T) {
		in := "p{}\t\n\r"
		if got := escapeCSS(in); got != in {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("no invalid XML chars", func(t *testing.T) {
		got := escapeCSS("p{}\f\x01")
		for _, r := range got {
			if r <= 0x08 || r == 0x0B || r == 0x0C || (r >= 0x0E && r <= 0x1F) {
				t.Fatalf("U+%04X in %q", r, got)
			}
		}
	})

	t.Run("xhtml copy parses", func(t *testing.T) {
		out := ApplyCSS("application/xhtml+xml", []byte(xhtmlDoc), "p{}\f\x01")
		if err := strictXMLErr(out); err != nil {
			t.Fatalf("%v in %q", err, out)
		}
	})
}
