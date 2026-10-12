package handler

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/0x2E/fusion/internal/config"
)

// Validate must apply the same 20 MiB feed body cap as pulling: an oversized
// feed (/big.xml) is not returned as valid.
func TestValidateFeedOversizedBodyReturnsNoFeeds(t *testing.T) {
	const feedLimit = 20 << 20
	padding := strings.Repeat("x", feedLimit+1024)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/feed.xml" && r.URL.Path != "/big.xml" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = fmt.Fprint(w, `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Gardening Weekly</title><link>https://example.com</link>
<item><guid>g1</guid><title>Item</title><link>https://example.com/1</link><description>`)
		if r.URL.Path == "/big.xml" {
			_, _ = fmt.Fprint(w, padding)
		}
		_, _ = fmt.Fprint(w, `</description></item></channel></rss>`)
	}))
	defer server.Close()

	h := &Handler{config: &config.Config{AllowPrivateFeeds: true}}

	// Control: a small valid feed on the same server is returned.
	code, body := postValidateFeed(t, h, server.URL+"/feed.xml")
	if code != http.StatusOK || len(body.Data.Feeds) != 1 {
		t.Fatalf("control: code=%d feeds=%+v, want 200 and 1 feed", code, body.Data.Feeds)
	}

	_, body = postValidateFeed(t, h, server.URL+"/big.xml")
	for _, f := range body.Data.Feeds {
		if f.Link == server.URL+"/big.xml" {
			t.Fatalf("oversized feed returned as valid: %+v", body.Data.Feeds)
		}
	}
}
