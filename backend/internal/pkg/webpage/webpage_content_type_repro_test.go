package webpage

import (
	"context"
	"mime"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A non-HTML response is copied with its own media type and untouched bytes;
// only HTML gets a <base>.
func TestFetchKeepsNonHTMLContentType(t *testing.T) {
	const pdf = "%PDF-1.4 test"

	t.Run("pdf is served as pdf without base", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Content-Type", "application/pdf")
			_, _ = w.Write([]byte(pdf))
		}))
		defer srv.Close()

		page, err := Fetch(context.Background(), srv.Client(), srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		mediaType, _, _ := mime.ParseMediaType(page.ContentType)
		if mediaType != "application/pdf" {
			t.Errorf("content type = %q, want application/pdf", page.ContentType)
		}
		if string(page.Body) != pdf {
			t.Errorf("body = %q, want original bytes %q", page.Body, pdf)
		}
	})

	t.Run("control: html keeps html and gets base", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("<html><head><title>x</title></head><body>hi</body></html>"))
		}))
		defer srv.Close()

		page, err := Fetch(context.Background(), srv.Client(), srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		if page.ContentType != "text/html" || !strings.Contains(string(page.Body), "<base ") {
			t.Fatalf("got %q %s", page.ContentType, page.Body)
		}
	})
}
