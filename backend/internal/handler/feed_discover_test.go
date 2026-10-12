package handler

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
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
