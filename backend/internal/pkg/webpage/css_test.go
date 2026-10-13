package webpage

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestInjectStyle(t *testing.T) {
	const style = `<style>#a{display:none}</style>`
	tests := []struct{ name, in, want string }{
		{"before body close", `<body>x</body></html>`, `<body>x` + style + `</body></html>`},
		{"last body close wins, any case", `<body>a</body>b</BODY >c</html>`, `<body>a</body>b` + style + `</BODY >c</html>`},
		{"no body, before html close", `<p>x</p></HTML>`, `<p>x</p>` + style + `</HTML>`},
		{"neither", `<p>x`, `<p>x` + style},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(InjectStyle([]byte(tt.in), `#a{display:none}`)); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}

	t.Run("closing tags in css are escaped", func(t *testing.T) {
		got := string(InjectStyle([]byte(`<body></body>`), `a{content:"</style><script>x</script>"}`))
		if strings.Contains(got, "</style><script>") || !strings.Contains(got, `\3c /style>`) {
			t.Fatalf("got %q", got)
		}
	})
}

func TestStripMetaCSP(t *testing.T) {
	tests := []struct {
		name, in string
		stripped bool
	}{
		{"double quotes", `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`, true},
		{"single quotes, upper case", `<META HTTP-EQUIV='content-security-policy' CONTENT="x">`, true},
		{"no quotes, content first, self closing", `<meta content="a>b" http-equiv=Content-Security-Policy />`, true},
		{"report-only stays", `<meta http-equiv="Content-Security-Policy-Report-Only" content="x">`, false},
		{"other http-equiv stays", `<meta http-equiv="refresh" content="Content-Security-Policy">`, false},
		{"plain meta stays", `<meta charset="utf-8">`, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := string(StripMetaCSP([]byte("a" + tt.in + "b")))
			if tt.stripped && got != "ab" || !tt.stripped && got != "a"+tt.in+"b" {
				t.Fatalf("got %q", got)
			}
		})
	}
}

func TestApplyCSSOnSavedPage(t *testing.T) {
	page, err := os.ReadFile("testdata/recipes_page.html")
	if err != nil {
		t.Fatal(err)
	}

	got := string(ApplyCSS("text/html; charset=utf-8", page, `#newsletter{display:none}`))

	if strings.Count(got, "<style>") != 1 {
		t.Fatalf("want one style block:\n%s", got)
	}
	// The script holds a "</body>" string earlier, but the real last one is the
	// closing tag; the style must come right before it.
	if !strings.Contains(got, "</footer>\n<style>#newsletter{display:none}</style></BODY>") {
		t.Fatalf("style not placed before the last </body>:\n%s", got)
	}
	if strings.Contains(got, "style-src 'self'") || strings.Contains(got, "script-src 'none'") {
		t.Fatalf("meta csp left in page:\n%s", got)
	}
	for _, keep := range []string{`<meta charset="utf-8">`, `name="viewport"`, "Content-Security-Policy-Report-Only", `http-equiv="refresh-not"`} {
		if !strings.Contains(got, keep) {
			t.Fatalf("lost %q:\n%s", keep, got)
		}
	}
}

func TestApplyCSSLeavesOtherTypes(t *testing.T) {
	body := []byte(`{"a":"</body>"}`)
	if got := ApplyCSS("application/json", body, "a{}"); string(got) != string(body) {
		t.Fatalf("got %q", got)
	}
}

func TestFetchCopyForcesCopyOfFrameablePage(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<html><head></head><body>hello</body></html>`))
	}))
	defer srv.Close()

	page, err := FetchCopy(context.Background(), srv.Client(), srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	if page.Embeddable || !strings.Contains(string(page.Body), "hello") {
		t.Fatalf("expected a copy, got %+v", page)
	}
}
