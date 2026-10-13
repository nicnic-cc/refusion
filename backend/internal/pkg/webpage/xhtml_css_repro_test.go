package webpage

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"strings"
	"testing"
)

const xhtmlDoc = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body><a>x</a></body></html>`

func strictXMLErr(b []byte) error {
	d := xml.NewDecoder(bytes.NewReader(b))
	for {
		if _, err := d.Token(); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}

// An XHTML copy with an injected <base> must stay well-formed XML.
func TestReproXHTMLCopyWellFormed(t *testing.T) {
	t.Run("control: input parses", func(t *testing.T) {
		if err := strictXMLErr([]byte(xhtmlDoc)); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("copy parses", func(t *testing.T) {
		_, body := copyAs("application/xhtml+xml", []byte(xhtmlDoc), "https://example.org/a/")
		if err := strictXMLErr(body); err != nil {
			t.Fatalf("%v in %q", err, body)
		}
	})
}

// Injected CSS in an XHTML copy must keep the document well-formed XML.
func TestReproXHTMLApplyCSSWellFormed(t *testing.T) {
	tests := []struct{ name, css string }{
		{"control: plain css", `a{color:red}`},
		{"ampersand", `a{background:url(/i.png?a=1&b=2)}`},
		{"closing tag text", `a::after{content:"</x>"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := ApplyCSS("application/xhtml+xml", []byte(xhtmlDoc), tt.css)
			if err := strictXMLErr(out); err != nil {
				t.Fatalf("%v in %q", err, out)
			}
		})
	}
}

// Non-ASCII in injected CSS is escaped so it survives a non-UTF-8 page charset.
func TestReproApplyCSSNonASCIIEscaped(t *testing.T) {
	const ct = "text/html; charset=shift_jis"
	const page = "<html><body>x</body></html>"

	t.Run("control: ascii verbatim", func(t *testing.T) {
		out := ApplyCSS(ct, []byte(page), `a::before{content:"x"}`)
		if !strings.Contains(string(out), `a::before{content:"x"}`) {
			t.Fatalf("got %q", out)
		}
	})

	t.Run("non-ascii escaped", func(t *testing.T) {
		out := ApplyCSS(ct, []byte(page), `a::before{content:"→"}`)
		for i, c := range out {
			if c >= 0x80 {
				t.Fatalf("byte 0x%x at %d in %q", c, i, out)
			}
		}
	})
}
