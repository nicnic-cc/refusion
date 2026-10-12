package handler

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

func TestGetItemPageUsesPermalinkOnlyWhenFeedOpensIt(t *testing.T) {
	h, st := newFeverTestHandler(t)
	h.config.AllowPrivateFeeds = true

	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("X-Frame-Options", "DENY")
		_, _ = w.Write([]byte("<html><head></head><body>" + r.URL.Path + "</body></html>"))
	}))
	defer site.Close()

	group, _ := st.CreateGroup("G")
	feed, err := st.CreateFeed(group.ID, "Feed", site.URL+"/feed", site.URL, "", nil, "feed")
	if err != nil {
		t.Fatalf("CreateFeed: %v", err)
	}
	if _, err := st.BatchCreateItemsIgnore(feed.ID, []store.BatchCreateItemInput{
		{GUID: "g1", Title: "Item", Link: site.URL + "/linked", Permalink: site.URL + "/own", Content: "c", PubDate: 100},
	}); err != nil {
		t.Fatalf("BatchCreateItemsIgnore: %v", err)
	}
	items, _ := st.ListItems(store.ListItemsParams{FeedID: &feed.ID})

	r := newTestRouter()
	r.GET("/items/:id/page", h.getItemPage)
	path := "/items/" + strconv.FormatInt(items[0].ID, 10) + "/page"

	w := performRequest(r, http.MethodGet, path, nil, nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), ">/linked<") {
		t.Fatalf("open_permalink off: status %d body %s", w.Code, w.Body.String())
	}

	on := true
	if err := st.UpdateFeed(feed.ID, store.UpdateFeedParams{OpenPermalink: &on}); err != nil {
		t.Fatalf("UpdateFeed: %v", err)
	}
	w = performRequest(r, http.MethodGet, path, nil, nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), ">/own<") {
		t.Fatalf("open_permalink on: status %d body %s", w.Code, w.Body.String())
	}
}

func TestFeedOpenPermalinkEndpoints(t *testing.T) {
	h, st := newAnonTestHandler(t, &recordingPuller{})
	router := h.SetupRouter()
	jsonHeader := map[string]string{"Content-Type": "application/json"}

	w := performRequest(router, http.MethodPost, "/api/feeds",
		mustJSONBody(t, gin.H{"group_id": 1, "name": "A", "link": "https://example.com/a.xml", "open_permalink": true}), jsonHeader)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"open_permalink":true`) {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	feeds, _ := st.ListFeeds()
	if len(feeds) != 1 || !feeds[0].OpenPermalink {
		t.Fatalf("expected stored open_permalink true: %+v", feeds)
	}

	path := "/api/feeds/" + strconv.FormatInt(feeds[0].ID, 10)
	w = performRequest(router, http.MethodPatch, path, mustJSONBody(t, gin.H{"open_permalink": false}), jsonHeader)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"open_permalink":false`) {
		t.Fatalf("update: %d %s", w.Code, w.Body.String())
	}
}
