package handler

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Relative feed links resolve against the URL after redirects (/blog/), not the
// typed one (/blog).
func TestDiscoverFeedsResolvesRelativeLinkAgainstFinalURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/blog":
			http.Redirect(w, r, "/blog/", http.StatusMovedPermanently)
		case "/blog/":
			w.Header().Set("Content-Type", "text/html")
			_, _ = fmt.Fprint(w, `<html><head><title>Blog</title><link rel="alternate" type="application/rss+xml" href="feed.xml"></head><body></body></html>`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	feeds, err := discoverFeeds(context.Background(), server.URL+"/blog", "", true)
	if err != nil {
		t.Fatal(err)
	}
	want := server.URL + "/blog/feed.xml"
	if len(feeds) != 1 || feeds[0].Link != want {
		t.Fatalf("feeds = %+v, want one link %q", feeds, want)
	}
}
