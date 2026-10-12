package handler

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"sync"
	"sync/atomic"
	"testing"
)

// Discovery must dial through the guarded client: with private feeds off, a
// loopback host is never contacted (this is the blind-SSRF path of validate).
func TestDiscoverFeedsRefusesInternalAddress(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprint(w, `<html><head><link type="application/rss+xml" href="/feed.xml" title="x"></head></html>`)
	}))
	defer server.Close()

	feeds, _ := discoverFeeds(context.Background(), server.URL, "", false)

	if n := hits.Load(); n != 0 {
		t.Fatalf("internal server was contacted %d times", n)
	}
	if len(feeds) != 0 {
		t.Fatalf("feeds = %+v, want none", feeds)
	}
}

// GitHub and Reddit feeds come from the URL alone; paths the rules do not
// match must return nothing so the guarded page discovery handles them.
func TestServiceFeedsFromURL(t *testing.T) {
	tests := []struct {
		target string
		want   []string // feed links, in order
	}{
		{"https://github.com/owner/repo", []string{
			"https://github.com/owner/repo/commits.atom",
			"https://github.com/owner/repo/releases.atom",
			"https://github.com/owner/repo/tags.atom",
			"https://github.com/owner/repo/wiki.atom",
		}},
		{"https://github.com/owner", []string{"https://github.com/owner.atom"}},
		{"https://github.com", []string{
			"https://github.com/timeline",
			"https://github.com/security-advisories.atom",
		}},
		{"https://github.com/", nil},
		{"https://github.com/a--b", nil},
		{"https://github.com/owner/-", nil},
		{"https://www.reddit.com/r/golang", []string{
			"https://reddit.com/r/golang/hot/.rss",
			"https://reddit.com/r/golang/new/.rss",
			"https://reddit.com/r/golang/top/.rss",
			"https://reddit.com/r/golang/rising/.rss",
		}},
		{"https://www.reddit.com/r/golang/comments/abc/title/", []string{
			"https://www.reddit.com/r/golang/comments/abc/title/.rss",
		}},
		{"https://www.reddit.com/user/bob", []string{
			"https://reddit.com/user/bob/.rss?sort=new",
			"https://reddit.com/user/bob/.rss?sort=hot",
			"https://reddit.com/user/bob/.rss?sort=top",
			"https://reddit.com/user/bob/submitted/.rss?sort=new",
			"https://reddit.com/user/bob/submitted/.rss?sort=hot",
			"https://reddit.com/user/bob/submitted/.rss?sort=top",
			"https://reddit.com/user/bob/comments/.rss?sort=new",
			"https://reddit.com/user/bob/comments/.rss?sort=hot",
			"https://reddit.com/user/bob/comments/.rss?sort=top",
			"https://old.reddit.com/user/bob/gilded/.rss",
		}},
		{"https://www.reddit.com/domain/example.com", []string{"https://reddit.com/domain/example.com/.rss"}},
		{"https://www.reddit.com/", []string{"https://www.reddit.com/.rss"}},
		{"https://www.reddit.com/search?q=go", []string{"https://www.reddit.com/.rss"}}, // single segment, as in feedfinder
		{"https://www.reddit.com/u/bob", nil},
		{"https://www.reddit.com/search/x", nil},
	}
	for _, tc := range tests {
		t.Run(tc.target, func(t *testing.T) {
			u, err := url.Parse(tc.target)
			if err != nil {
				t.Fatal(err)
			}
			d := &feedDiscoverer{target: u}
			var got []string
			for _, f := range d.fromService(context.Background()) {
				got = append(got, f.Link)
			}
			if !slices.Equal(got, tc.want) {
				t.Fatalf("links = %v, want %v", got, tc.want)
			}
		})
	}
}

// fromService must never fetch with an unguarded client: the stand-in proxy
// redirects every public host to loopback, and no request may reach it.
func TestServiceDiscoveryNoUnguardedFetch(t *testing.T) {
	var mu sync.Mutex
	var seen []string
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen = append(seen, r.URL.Host+r.URL.Path)
		mu.Unlock()
		if r.URL.Hostname() == "127.0.0.1" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		http.Redirect(w, r, "http://127.0.0.1:9/internal-admin", http.StatusFound)
	}))
	defer proxy.Close()

	for _, target := range []string{
		"http://github.com/",          // empty username
		"http://github.com/a--b",      // username fails the GitHub name rule
		"http://www.reddit.com/u/xyz", // short user form, unmatched mode
		"http://www.reddit.com/search?q=go",
		"http://github.com/owner/repo", // control: built from the URL, no fetch
	} {
		t.Run(target, func(t *testing.T) {
			mu.Lock()
			seen = nil
			mu.Unlock()
			u, _ := url.Parse(target)
			d := &feedDiscoverer{target: u, proxy: proxy.URL}
			d.fromService(context.Background())
			mu.Lock()
			defer mu.Unlock()
			if len(seen) != 0 {
				t.Fatalf("fromService fetched: %v", seen)
			}
		})
	}
}
