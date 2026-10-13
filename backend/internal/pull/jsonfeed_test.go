package pull

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/0x2E/fusion/internal/model"
)

// gofeed v1.4.0 sniffed the type from a 4096-byte prefix and ran json.Valid on
// it, so any JSON Feed past that size was rejected as "failed to detect feed type".
func TestFetchAndParseJSONFeedLargerThanSniffWindow(t *testing.T) {
	body, err := os.ReadFile("testdata/jsonfeed-large.json")
	if err != nil {
		t.Fatal(err)
	}
	if len(body) <= 4096 {
		t.Fatalf("fixture is %d bytes, must exceed 4096", len(body))
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/feed+json")
		_, _ = w.Write(body)
	}))
	defer server.Close()

	result, err := FetchAndParse(context.Background(), &model.Feed{Link: server.URL}, 5*time.Second, true)
	if err != nil {
		t.Fatalf("FetchAndParse() failed: %v", err)
	}
	if result.FeedTitle != "Crumb & Crust" {
		t.Fatalf("feed title = %q", result.FeedTitle)
	}

	want := []struct {
		guid, link, title, date string
	}{
		{"recipe-sourdough-basics", "https://recipes.example.com/sourdough-basics/", "Sourdough basics", "2026-03-01T08:00:00+01:00"},
		{"recipe-garlic-focaccia", "https://recipes.example.com/garlic-focaccia/", "Garlic focaccia", "2026-03-08T08:00:00+01:00"},
		{"recipe-rye-crackers", "https://recipes.example.com/rye-crackers/", "Rye crackers", "2026-03-15T08:00:00+01:00"},
	}
	if len(result.Items) != len(want) {
		t.Fatalf("got %d items, want %d", len(result.Items), len(want))
	}
	for i, w := range want {
		got := result.Items[i]
		pub, _ := time.Parse(time.RFC3339, w.date)
		if got.GUID != w.guid || got.Link != w.link || got.Title != w.title || got.PubDate != pub.Unix() {
			t.Fatalf("item %d = {%q %q %q %d}, want {%q %q %q %d}",
				i, got.GUID, got.Link, got.Title, got.PubDate, w.guid, w.link, w.title, pub.Unix())
		}
		if !strings.HasPrefix(got.Content, "<h2>"+w.title+"</h2><p>Knead") {
			t.Fatalf("item %d content starts %q", i, got.Content[:min(len(got.Content), 60)])
		}
	}
}
