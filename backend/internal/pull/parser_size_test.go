package pull

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/0x2E/fusion/internal/model"
)

// Mirrors the production cap on purpose: the test must not move with it.
const testFeedLimit = 20 << 20

const (
	sizeFeedHead = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Big</title><item><guid>g1</guid><title>t</title><description>`
	sizeFeedTail = `</description></item></channel></rss>`
)

// serveFeedOfSize streams a valid RSS document of exactly total bytes without
// holding it in memory.
func serveFeedOfSize(t *testing.T, total int) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = w.Write([]byte(sizeFeedHead))
		chunk := bytes.Repeat([]byte("a"), 64<<10)
		remaining := total - len(sizeFeedHead) - len(sizeFeedTail)
		for remaining > 0 {
			n := min(remaining, len(chunk))
			if _, err := w.Write(chunk[:n]); err != nil {
				return
			}
			remaining -= n
		}
		_, _ = w.Write([]byte(sizeFeedTail))
	}))
	t.Cleanup(server.Close)
	return server
}

func TestFetchAndParseRejectsOversizedFeed(t *testing.T) {
	server := serveFeedOfSize(t, testFeedLimit+1)

	_, err := FetchAndParse(context.Background(), &model.Feed{Link: server.URL}, 30*time.Second, true)
	if err == nil {
		t.Fatal("expected error for feed over the size limit, got nil")
	}
	if !strings.Contains(err.Error(), "feed too large") {
		t.Fatalf("error = %q, want it to contain %q", err, "feed too large")
	}
}

func TestFetchAndParseAcceptsFeedAtSizeLimit(t *testing.T) {
	server := serveFeedOfSize(t, testFeedLimit)

	result, err := FetchAndParse(context.Background(), &model.Feed{Link: server.URL}, 30*time.Second, true)
	if err != nil {
		t.Fatalf("FetchAndParse() failed for feed exactly at the limit: %v", err)
	}
	if len(result.Items) != 1 {
		t.Fatalf("got %d items, want 1", len(result.Items))
	}
}
