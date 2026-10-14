package pull

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/0x2E/fusion/internal/model"
)

func fetchBody(t *testing.T, contentType, body string) (*FetchResult, error) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("ETag", `"v1"`)
		_, _ = w.Write([]byte(body))
	}))
	defer server.Close()
	return FetchAndParse(context.Background(), &model.Feed{Link: server.URL}, 5*time.Second, true)
}

func rdfFeedNS(ns string) string {
	return `<?xml version="1.0" encoding="UTF-8"?>` +
		`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="` + ns + `">` +
		`<channel rdf:about="x"><title>T</title><link>https://feed.example.com/</link></channel>` +
		`<item rdf:about="https://feed.example.com/a"><title>a</title><link>https://feed.example.com/a</link></item></rdf:RDF>`
}

func atomFeedNS(ns string) string {
	return `<?xml version="1.0" encoding="UTF-8"?>` +
		`<feed xmlns="` + ns + `"><title>T</title><id>urn:x</id>` +
		`<entry><id>urn:a</id><title>a</title><link href="https://feed.example.com/a"/></entry></feed>`
}

func rssFeed(channelAttrs, items string) string {
	return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel` + channelAttrs +
		`><title>T</title><link>https://feed.example.com/</link>` + items + `</channel></rss>`
}

const rssOneItem = `<item><title>a</title><link>https://feed.example.com/a</link></item>`

func TestFetchAndParseItemNamespace(t *testing.T) {
	tests := []struct {
		name      string
		ctype     string
		body      string
		wantItems int
		wantErr   bool
	}{
		{"rdf no trailing slash", "application/rss+xml", rdfFeedNS("http://purl.org/rss/1.0"), 0, true},
		{"atom trailing slash", "application/atom+xml", atomFeedNS("http://www.w3.org/2005/Atom/"), 0, true},
		{"rss channel custom xmlns", "application/rss+xml", rssFeed(` xmlns="http://example.com/ns"`, rssOneItem), 0, true},

		{"rdf canonical", "application/rss+xml", rdfFeedNS("http://purl.org/rss/1.0/"), 1, false},
		{"atom canonical", "application/atom+xml", atomFeedNS("http://www.w3.org/2005/Atom"), 1, false},
		{"rss 2.0", "application/rss+xml", rssFeed("", rssOneItem), 1, false},

		{"rss with zero items", "application/rss+xml", rssFeed("", ""), 0, false},
		{"json feed with zero items", "application/feed+json",
			`{"version":"https://jsonfeed.org/version/1.1","title":"T","items":[]}`, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := fetchBody(t, tt.ctype, tt.body)
			if tt.wantErr {
				if err == nil || !strings.Contains(err.Error(), "namespace") {
					t.Fatalf("err = %v, want namespace error", err)
				}
				if result == nil || result.ETag != `"v1"` {
					t.Fatalf("result = %+v, want fetch metadata kept alongside the error", result)
				}
				return
			}
			if err != nil {
				t.Fatalf("FetchAndParse() error: %v", err)
			}
			if len(result.Items) != tt.wantItems {
				t.Fatalf("got %d items, want %d", len(result.Items), tt.wantItems)
			}
		})
	}
}

func TestCountItemElements(t *testing.T) {
	tests := []struct {
		name string
		body string
		want int
	}{
		{"bom before xml", "\xef\xbb\xbf" + rssFeed(` xmlns="http://example.com/ns"`, rssOneItem), 1},
		{"leading whitespace", "\n  " + atomFeedNS("http://www.w3.org/2005/Atom/"), 1},
		{"json body", `{"title":"<item>","items":[]}`, 0},
		{"item nested in channel extension", rssFeed("", `<x:related xmlns:x="u"><x:item/></x:related>`), 0},
		{"item directly under rss", `<rss><item/></rss>`, 1},
		{"entry under non-feed root", `<rss><channel><entry/></channel></rss>`, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := countItemElements([]byte(tt.body)); got != tt.want {
				t.Fatalf("countItemElements() = %d, want %d", got, tt.want)
			}
		})
	}
}
