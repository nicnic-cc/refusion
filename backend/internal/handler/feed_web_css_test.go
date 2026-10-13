package handler

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/0x2E/fusion/internal/store"
)

const framablePage = `<html><head><meta http-equiv="Content-Security-Policy" content="style-src 'none'"></head>` +
	`<body><div id="ads">ads</div>recipe</body></html>`

type cssFixture struct {
	t       *testing.T
	st      *store.Store
	router  http.Handler
	feedID  int64
	pageURL string
	siteURL string
}

// newCSSFixture serves a frameable https page, so without CSS the item page redirects to it.
func newCSSFixture(t *testing.T) *cssFixture {
	t.Helper()
	h, st := newFeverTestHandler(t)
	h.config.AllowPrivateFeeds = true

	site := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(framablePage))
	}))
	t.Cleanup(site.Close)
	prev := newWebPageClient
	newWebPageClient = func(_ time.Duration, _ string, _ bool) (*http.Client, error) { return site.Client(), nil }
	t.Cleanup(func() { newWebPageClient = prev })

	group, err := st.CreateGroup("G")
	if err != nil {
		t.Fatal(err)
	}
	feed, err := st.CreateFeed(group.ID, "Feed", site.URL+"/feed", site.URL, "", nil, "feed")
	if err != nil {
		t.Fatal(err)
	}
	item, err := st.CreateItem(feed.ID, "g1", "Item", site.URL+"/post", "c", 100)
	if err != nil {
		t.Fatal(err)
	}

	r := newTestRouter()
	r.GET("/items/:id/page", h.getItemPage)
	r.POST("/items/:id/page", h.getItemPage)
	r.GET("/feed-css", h.listFeedWebCSS)
	r.PUT("/feeds/:id/css", h.putFeedWebCSS)
	r.DELETE("/feeds/:id/css", h.deleteFeedWebCSS)
	return &cssFixture{t: t, st: st, router: r, feedID: feed.ID, siteURL: site.URL,
		pageURL: "/items/" + strconv.FormatInt(item.ID, 10) + "/page"}
}

func (f *cssFixture) putCSS(css string) int {
	return performRequest(f.router, http.MethodPut, "/feeds/"+strconv.FormatInt(f.feedID, 10)+"/css",
		mustJSONBody(f.t, map[string]string{"css": css}), map[string]string{"Content-Type": "application/json"}).Code
}

func TestItemPageRedirectsWithoutCSSAndCopiesWithIt(t *testing.T) {
	f := newCSSFixture(t)

	w := performRequest(f.router, http.MethodGet, f.pageURL, nil, nil)
	if w.Code != http.StatusFound || w.Header().Get("Location") != f.siteURL+"/post" {
		t.Fatalf("without css: status %d, location %q", w.Code, w.Header().Get("Location"))
	}

	if code := f.putCSS("#ads{display:none}"); code != http.StatusOK {
		t.Fatalf("PUT css = %d", code)
	}
	w = performRequest(f.router, http.MethodGet, f.pageURL, nil, nil)
	body := w.Body.String()
	if w.Code != http.StatusOK || !strings.Contains(w.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatalf("with css: status %d, csp %q", w.Code, w.Header().Get("Content-Security-Policy"))
	}
	if !strings.Contains(body, "<style>#ads{display:none}</style></body>") || strings.Contains(body, "style-src") {
		t.Fatalf("body = %s", body)
	}

	if code := performRequest(f.router, http.MethodDelete, "/feeds/"+strconv.FormatInt(f.feedID, 10)+"/css", nil, nil).Code; code != http.StatusNoContent {
		t.Fatalf("DELETE css = %d", code)
	}
	if w := performRequest(f.router, http.MethodGet, f.pageURL, nil, nil); w.Code != http.StatusFound {
		t.Fatalf("after delete: status %d", w.Code)
	}
}

func (f *cssFixture) postDraft(css string) *httptest.ResponseRecorder {
	return performRequest(f.router, http.MethodPost, f.pageURL, strings.NewReader(url.Values{"css": {css}}.Encode()),
		map[string]string{"Content-Type": "application/x-www-form-urlencoded"})
}

func TestItemPagePostDraftOverridesStored(t *testing.T) {
	f := newCSSFixture(t)
	f.putCSS("#ads{display:none}")

	if body := f.postDraft("p{color:red}").Body.String(); !strings.Contains(body, "p{color:red}") || strings.Contains(body, "#ads{display:none}") {
		t.Fatalf("draft not used: %s", body)
	}
	w := f.postDraft("")
	if w.Code != http.StatusOK || strings.Contains(w.Body.String(), "<style>") || !strings.Contains(w.Body.String(), "recipe") {
		t.Fatalf("empty draft: status %d, body %s", w.Code, w.Body.String())
	}
}

// A draft above the 8 KB a proxy allows in a request line must still reach the copy.
func TestItemPagePostLargeDraftIsInjected(t *testing.T) {
	f := newCSSFixture(t)
	draft := "p{color:red}" + strings.Repeat("/* x */", 2000)
	if len(draft) <= 8<<10 || len(draft) > store.MaxFeedWebCSSBytes {
		t.Fatalf("test draft size %d out of range", len(draft))
	}
	w := f.postDraft(draft)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), draft) {
		t.Fatalf("status %d, draft not injected", w.Code)
	}
}

func TestItemPagePostOversizedDraftRejected(t *testing.T) {
	f := newCSSFixture(t)
	if code := f.postDraft(strings.Repeat("a", store.MaxFeedWebCSSBytes+1)).Code; code != http.StatusBadRequest {
		t.Fatalf("oversized draft = %d", code)
	}
}

func TestItemPageGetIgnoresCSSQuery(t *testing.T) {
	f := newCSSFixture(t)

	// No stored CSS: the draft in the URL must not force a copy.
	w := performRequest(f.router, http.MethodGet, f.pageURL+"?css="+url.QueryEscape("p{color:red}"), nil, nil)
	if w.Code != http.StatusFound {
		t.Fatalf("without stored css: status %d, want redirect", w.Code)
	}

	f.putCSS("#ads{display:none}")
	body := performRequest(f.router, http.MethodGet, f.pageURL+"?css="+url.QueryEscape("p{color:red}"), nil, nil).Body.String()
	if !strings.Contains(body, "#ads{display:none}") || strings.Contains(body, "p{color:red}") {
		t.Fatalf("stored css not used alone: %s", body)
	}
}

func TestItemPagePostEmptyDraftWorksWithoutStoredCSS(t *testing.T) {
	f := newCSSFixture(t)
	if w := f.postDraft(""); w.Code != http.StatusOK {
		t.Fatalf("empty draft on a frameable site: status %d, want a copy", w.Code)
	}
}

func TestPutFeedWebCSSRules(t *testing.T) {
	f := newCSSFixture(t)

	if code := f.putCSS(strings.Repeat("a", store.MaxFeedWebCSSBytes+1)); code != http.StatusBadRequest {
		t.Fatalf("oversized = %d", code)
	}
	if code := f.putCSS("a{}"); code != http.StatusOK {
		t.Fatalf("save = %d", code)
	}
	if code := f.putCSS(" \n\t"); code != http.StatusNoContent {
		t.Fatalf("whitespace = %d, want 204", code)
	}
	if _, err := f.st.GetFeedWebCSS(f.feedID); err == nil {
		t.Fatal("whitespace-only css must delete the row")
	}
	// Unknown feed.
	w := performRequest(f.router, http.MethodPut, "/feeds/9999/css", mustJSONBody(t, map[string]string{"css": "a{}"}),
		map[string]string{"Content-Type": "application/json"})
	if w.Code != http.StatusNotFound {
		t.Fatalf("unknown feed = %d", w.Code)
	}
}

func TestListFeedWebCSS(t *testing.T) {
	f := newCSSFixture(t)
	f.putCSS("a{}")
	w := performRequest(f.router, http.MethodGet, "/feed-css", nil, nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"css":"a{}"`) || !strings.Contains(w.Body.String(), `"total":1`) {
		t.Fatalf("list = %d %s", w.Code, w.Body.String())
	}
}
