package pull

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/0x2E/fusion/internal/config"
	"github.com/0x2E/fusion/internal/store"
)

func TestRefreshFeedsReportsPendingThenNewItems(t *testing.T) {
	st, err := store.New(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	defer st.Close()

	gate := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-gate
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Demo</title><link>https://example.com</link>
<item><guid>%[1]s-1</guid><title>One</title><link>https://example.com%[1]s/1</link></item>
<item><guid>%[1]s-2</guid><title>Two</title><link>https://example.com%[1]s/2</link></item>
</channel></rss>`, r.URL.Path)
	}))
	defer server.Close()

	a, err := st.CreateFeed(1, "A", server.URL+"/a", "", "", nil, false)
	if err != nil {
		t.Fatalf("create feed A: %v", err)
	}
	b, err := st.CreateFeed(1, "B", server.URL+"/b", "", "", nil, false)
	if err != nil {
		t.Fatalf("create feed B: %v", err)
	}

	p := New(st, &config.Config{
		PullInterval:      1800,
		PullTimeout:       5,
		PullConcurrency:   1,
		PullMaxBackoff:    604800,
		AllowPrivateFeeds: true,
	})

	if got := p.RefreshFeeds([]int64{a.ID, b.ID}); got != 2 {
		t.Fatalf("queued = %d, want 2", got)
	}
	if got := p.RefreshFeeds([]int64{a.ID}); got != 0 {
		t.Fatalf("queued while pending = %d, want 0", got)
	}

	pending, _ := p.PullStatus()
	if want := []int64{a.ID, b.ID}; !slices.Equal(pending, want) {
		t.Fatalf("pending = %v, want %v", pending, want)
	}

	close(gate)

	deadline := time.Now().Add(5 * time.Second)
	for {
		pending, newItems := p.PullStatus()
		if len(pending) == 0 {
			if newItems != 4 {
				t.Fatalf("new_items = %d, want 4", newItems)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("still pending after 5s: %v", pending)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
