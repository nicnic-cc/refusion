package webpage

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFrameable(t *testing.T) {
	tests := []struct {
		name    string
		headers map[string][]string
		want    bool
	}{
		{"no headers", nil, true},
		{"x-frame-options", map[string][]string{"X-Frame-Options": {"SAMEORIGIN"}}, false},
		{"frame-ancestors self", map[string][]string{"Content-Security-Policy": {"default-src 'self'; frame-ancestors 'self'"}}, false},
		{"frame-ancestors star", map[string][]string{"Content-Security-Policy": {"frame-ancestors *"}}, true},
		{"frame-ancestors star plus host", map[string][]string{"Content-Security-Policy": {"frame-ancestors * https://a.example"}}, false},
		{"second policy blocks", map[string][]string{"Content-Security-Policy": {"img-src *, frame-ancestors 'none'"}}, false},
		{"csp without frame-ancestors", map[string][]string{"Content-Security-Policy": {"default-src 'self'"}}, true},
		{"report-only ignored", map[string][]string{"Content-Security-Policy-Report-Only": {"frame-ancestors 'none'"}}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := http.Header(tt.headers)
			if got := Frameable(h); got != tt.want {
				t.Fatalf("Frameable = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestInjectBase(t *testing.T) {
	const tag = `<base href="https://a.example/p?x=1&amp;y=2" target="_blank">`
	const u = "https://a.example/p?x=1&y=2"
	tests := []struct{ name, in, want string }{
		{"head with attrs", `<html><HEAD lang="x"><title>t</title></head>`, `<html><HEAD lang="x">` + tag + `<title>t</title></head>`},
		{"header element is not head", `<html><header>h</header>`, `<html>` + tag + `<header>h</header>`},
		{"no head", `<html class="a"><body>b`, `<html class="a">` + tag + `<body>b`},
		{"neither", `<p>hi`, tag + `<p>hi`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(InjectBase([]byte(tt.in), u)); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestFetchRedirectVersusCopy(t *testing.T) {
	const doc = `<html><head><title>x</title></head><body>hello</body></html>`

	t.Run("https page allowing framing is embedded", func(t *testing.T) {
		srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte(doc))
		}))
		defer srv.Close()

		page, err := Fetch(context.Background(), srv.Client(), srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		if !page.Embeddable || page.Body != nil {
			t.Fatalf("expected embeddable page without body, got %+v", page)
		}
	})

	t.Run("https page blocking framing is copied", func(t *testing.T) {
		srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
			_, _ = w.Write([]byte(doc))
		}))
		defer srv.Close()

		page, err := Fetch(context.Background(), srv.Client(), srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		if page.Embeddable || !strings.Contains(string(page.Body), `<head><base href="`+srv.URL) {
			t.Fatalf("expected copy with base, got %+v %s", page, page.Body)
		}
		if page.ContentType != "text/html; charset=iso-8859-1" {
			t.Fatalf("content type = %q", page.ContentType)
		}
	})

	t.Run("plain http page is copied even if frameable", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte(doc))
		}))
		defer srv.Close()

		page, err := Fetch(context.Background(), srv.Client(), srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		if page.Embeddable || page.ContentType != "text/plain" {
			t.Fatalf("expected copy keeping its text/plain type, got %+v", page)
		}
	})

	t.Run("non-2xx is an error", func(t *testing.T) {
		srv := httptest.NewServer(http.NotFoundHandler())
		defer srv.Close()

		if _, err := Fetch(context.Background(), srv.Client(), srv.URL); err == nil {
			t.Fatal("expected error")
		}
	})
}
