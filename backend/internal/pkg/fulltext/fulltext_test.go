package fulltext

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/0x2E/fusion/internal/pkg/httpc"
)

const recipePage = `<!doctype html>
<html><head><title>Lemon Barley Soup - Pantry Notes</title></head>
<body>
<nav><ul><li><a href="/">Home</a></li><li><a href="/archive">Browse the archive</a></li><li><a href="/about">About the pantry</a></li></ul></nav>
<div class="sidebar"><h3>Popular this week</h3><ul><li><a href="/a">Ten pickles</a></li><li><a href="/b">Sourdough basics</a></li></ul></div>
<article>
<h1>Lemon Barley Soup</h1>
<p>This soup starts with a cup of pearl barley, rinsed twice and simmered in plain water until the grains turn soft and slightly glossy. Keep the pot uncovered so the starch thickens the broth as it reduces.</p>
<p>While the barley cooks, soften two sliced leeks in olive oil with a pinch of salt. Add the zest of one lemon, a spoonful of crushed fennel seed, and a handful of chopped parsley stems. Stir for a few minutes until fragrant.</p>
<p>Combine everything, squeeze in the lemon juice just before serving, and finish with a drizzle of oil. The soup keeps for three days in the fridge and tastes better on the second day.</p>
</article>
<footer>Copyright Pantry Notes. Subscribe to our newsletter for weekly offers.</footer>
</body></html>`

func newTestClient(t *testing.T) *http.Client {
	t.Helper()
	client, err := httpc.NewClient(5*time.Second, "", true)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	return client
}

func serve(t *testing.T, status int, body string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func TestFetchExtractsArticleBody(t *testing.T) {
	srv := serve(t, http.StatusOK, recipePage)

	article, err := Fetch(context.Background(), newTestClient(t), srv.URL+"/soup")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}

	if !strings.Contains(article.Content, "pearl barley, rinsed twice") {
		t.Errorf("article body missing from content: %s", article.Content)
	}
	for _, chrome := range []string{"Browse the archive", "Popular this week", "newsletter"} {
		if strings.Contains(article.Content, chrome) {
			t.Errorf("page chrome %q leaked into content: %s", chrome, article.Content)
		}
	}
	if !strings.Contains(article.Title, "Lemon Barley Soup") {
		t.Errorf("unexpected title %q", article.Title)
	}
}

func TestFetchRejectsNon2xx(t *testing.T) {
	// A 404 page often carries enough text for readability to "extract" it.
	srv := serve(t, http.StatusNotFound, recipePage)

	if _, err := Fetch(context.Background(), newTestClient(t), srv.URL); err == nil {
		t.Fatal("expected error for 404 response")
	}
}

func TestFetchErrorsOnEmptyPage(t *testing.T) {
	srv := serve(t, http.StatusOK, "<html><head></head><body></body></html>")

	if _, err := Fetch(context.Background(), newTestClient(t), srv.URL); err == nil {
		t.Fatal("expected error for page without content")
	}
}
