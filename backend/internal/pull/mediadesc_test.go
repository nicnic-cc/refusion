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

func TestFetchAndParseMediaDescriptionFallback(t *testing.T) {
	feedXML := `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Demo Clips</title>
  <entry>
    <id>urn:clip-a</id>
    <title>Clip A</title>
    <published>2026-01-01T00:00:00Z</published>
    <media:group>
      <media:description>Line one &lt;script&gt; &amp; more
Line two</media:description>
    </media:group>
  </entry>
  <entry>
    <id>urn:clip-b</id>
    <title>Clip B</title>
    <published>2026-01-02T00:00:00Z</published>
    <content type="text">Real body</content>
    <media:group>
      <media:description>Ignored text</media:description>
    </media:group>
  </entry>
  <entry>
    <title>Clip C</title>
    <published>2026-01-03T00:00:00Z</published>
    <media:group>
      <media:description>Only a description</media:description>
    </media:group>
  </entry>
</feed>`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/atom+xml")
		_, _ = w.Write([]byte(feedXML))
	}))
	defer server.Close()

	result, err := FetchAndParse(context.Background(), &model.Feed{Link: server.URL}, 5*time.Second, true)
	if err != nil {
		t.Fatalf("FetchAndParse() failed: %v", err)
	}
	if len(result.Items) != 3 {
		t.Fatalf("got %d items, want 3", len(result.Items))
	}

	a := result.Items[0].Content
	for _, want := range []string{"&lt;script&gt;", "&amp;", "<br>\n"} {
		if !strings.Contains(a, want) {
			t.Fatalf("item A content %q missing %q", a, want)
		}
	}
	if strings.Contains(a, "<script>") {
		t.Fatalf("item A content has raw <script>: %q", a)
	}

	if got := result.Items[1].Content; got != "Real body" {
		t.Fatalf("item B content = %q, want %q", got, "Real body")
	}

	c := result.Items[2]
	published := time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC).Unix()
	if want := fallbackGUID("Clip C", "", published, true); c.GUID != want {
		t.Fatalf("item C GUID = %q, want %q", c.GUID, want)
	}
	if c.Content == "" {
		t.Fatal("item C content is empty")
	}
}
