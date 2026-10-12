package pull

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/0x2E/fusion/internal/model"
)

// parsePermalinks serves body as the feed of site example-news.test and
// returns each parsed item's permalink in feed order.
func parsePermalinks(t *testing.T, body string) []string {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	defer server.Close()

	feed := &model.Feed{Link: server.URL, SiteURL: "http://example-news.test"}
	result, err := FetchAndParse(context.Background(), feed, 5*time.Second, true)
	if err != nil {
		t.Fatalf("FetchAndParse() failed: %v", err)
	}
	got := make([]string, len(result.Items))
	for i, it := range result.Items {
		got[i] = it.Permalink
	}
	return got
}

func TestPermalinkFromRSSComments(t *testing.T) {
	got := parsePermalinks(t, `<?xml version="1.0"?>
<rss version="2.0"><channel><title>News</title><link>http://example-news.test</link>
<item><guid isPermaLink="false">a</guid><title>A</title><link>http://elsewhere.test/story</link>
<comments>http://example-news.test/item/42</comments></item>
<item><guid isPermaLink="false">b</guid><title>B</title><link>http://elsewhere.test/story-b</link>
<comments>/item/43</comments></item>
</channel></rss>`)
	want := []string{"http://example-news.test/item/42", "http://example-news.test/item/43"}
	if got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("permalinks = %q, want %q", got, want)
	}
}

func TestPermalinkFromAtomRelatedLink(t *testing.T) {
	got := parsePermalinks(t, `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>News</title><link href="http://example-news.test"/>
<entry><id>tag:elsewhere.test,1</id><title>A</title>
<link rel="alternate" href="http://elsewhere.test/story"/>
<link rel="related" href="http://www.example-news.test/linked/7"/>
<updated>2026-01-01T00:00:00Z</updated></entry>
</feed>`)
	if got[0] != "http://www.example-news.test/linked/7" {
		t.Fatalf("permalink = %q", got[0])
	}
}

func TestPermalinkFromGUIDURL(t *testing.T) {
	got := parsePermalinks(t, `<?xml version="1.0"?>
<rss version="2.0"><channel><title>News</title><link>http://example-news.test</link>
<item><guid>http://example-news.test/posts/9</guid><title>A</title><link>http://elsewhere.test/story</link></item>
</channel></rss>`)
	if got[0] != "http://example-news.test/posts/9" {
		t.Fatalf("permalink = %q", got[0])
	}
}

func TestPermalinkSkipsCandidatesOnOtherHosts(t *testing.T) {
	got := parsePermalinks(t, `<?xml version="1.0"?>
<rss version="2.0"><channel><title>News</title><link>http://example-news.test</link>
<item><guid>http://short.test/x1</guid><title>A</title><link>http://elsewhere.test/story</link>
<comments>http://short.test/c1</comments></item>
<item><guid>http://short.test/x2</guid><title>B</title><link>http://elsewhere.test/story-b</link>
<comments>http://short.test/c2</comments></item>
</channel></rss>`)
	if got[0] != "" || got[1] != "" {
		t.Fatalf("permalinks = %q, want none", got)
	}
}

func TestPermalinkSkipsOtherHostAndTakesNextCandidate(t *testing.T) {
	got := parsePermalinks(t, `<?xml version="1.0"?>
<rss version="2.0"><channel><title>News</title><link>http://example-news.test</link>
<item><guid>http://example-news.test/posts/9</guid><title>A</title><link>http://elsewhere.test/story</link>
<comments>http://short.test/c1</comments></item>
</channel></rss>`)
	if got[0] != "http://example-news.test/posts/9" {
		t.Fatalf("permalink = %q", got[0])
	}
}

func TestPermalinkNoneWhenMainLinkIsOnSiteHost(t *testing.T) {
	got := parsePermalinks(t, `<?xml version="1.0"?>
<rss version="2.0"><channel><title>News</title><link>http://example-news.test</link>
<item><guid>http://example-news.test/posts/9</guid><title>A</title><link>http://example-news.test/posts/9</link>
<comments>http://example-news.test/posts/9#comments</comments></item>
</channel></rss>`)
	if got[0] != "" {
		t.Fatalf("permalink = %q, want none", got[0])
	}
}
