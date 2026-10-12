package handler

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestGetItemPageServesSandboxedCopy(t *testing.T) {
	h, st := newFeverTestHandler(t)
	h.config.AllowPrivateFeeds = true

	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head></head><body>original</body></html>`))
	}))
	defer site.Close()

	group, err := st.CreateGroup("G")
	if err != nil {
		t.Fatalf("CreateGroup: %v", err)
	}
	feed, err := st.CreateFeed(group.ID, "Feed", site.URL+"/feed", site.URL, "", nil, false)
	if err != nil {
		t.Fatalf("CreateFeed: %v", err)
	}
	item, err := st.CreateItem(feed.ID, "g1", "Item", site.URL+"/post", "c", 100)
	if err != nil {
		t.Fatalf("CreateItem: %v", err)
	}

	r := newTestRouter()
	r.GET("/items/:id/page", h.getItemPage)
	w := performRequest(r, http.MethodGet, "/items/"+strconv.FormatInt(item.ID, 10)+"/page", nil, nil)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", w.Code, w.Body.String())
	}
	csp := w.Header().Get("Content-Security-Policy")
	if !strings.HasPrefix(csp, "sandbox ") || strings.Contains(csp, "allow-same-origin") {
		t.Fatalf("csp = %q", csp)
	}
	if w.Header().Get("X-Frame-Options") != "" {
		t.Fatal("framing header must not be forwarded")
	}
	if !strings.Contains(w.Body.String(), `<base href="`+site.URL+`/post"`) || !strings.Contains(w.Body.String(), "original") {
		t.Fatalf("body = %s", w.Body.String())
	}
}
