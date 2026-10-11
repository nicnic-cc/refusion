package handler

import (
	"net/http"
	"strconv"
	"strings"
	"testing"
)

// A duplicate group name is a client conflict (409), not a server error.
func TestCreateDuplicateGroupReturnsConflict(t *testing.T) {
	h, _ := newFeverTestHandler(t)
	h.allowAnonAPI = true
	r := newTestRouter()
	r.POST("/api/groups", h.createGroup)

	hdr := map[string]string{"Content-Type": "application/json"}
	w := performRequest(r, http.MethodPost, "/api/groups", strings.NewReader(`{"name":"News"}`), hdr)
	if w.Code != http.StatusOK {
		t.Fatalf("first create: expected 200, got %d", w.Code)
	}
	w = performRequest(r, http.MethodPost, "/api/groups", strings.NewReader(`{"name":"News"}`), hdr)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d", w.Code)
	}
}

// Moving a feed to a nonexistent group is a client error (4xx), not a 500.
func TestUpdateFeedUnknownGroupIsClientError(t *testing.T) {
	h, st := newFeverTestHandler(t)
	group, err := st.CreateGroup("Tech")
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	feed, err := st.CreateFeed(group.ID, "Feed", "https://example.com/rss.xml", "https://example.com", "", nil, false)
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	r := newTestRouter()
	r.PATCH("/api/feeds/:id", h.updateFeed)

	w := performRequest(r, http.MethodPatch, "/api/feeds/"+strconv.FormatInt(feed.ID, 10),
		strings.NewReader(`{"group_id":99999}`), map[string]string{"Content-Type": "application/json"})
	if w.Code < 400 || w.Code >= 500 {
		t.Fatalf("expected 4xx, got %d", w.Code)
	}
}

// Bookmarking the same link twice is a client conflict (409), not a server error.
func TestCreateDuplicateBookmarkReturnsConflict(t *testing.T) {
	h, _ := newFeverTestHandler(t)
	r := newTestRouter()
	r.POST("/api/bookmarks", h.createBookmark)

	hdr := map[string]string{"Content-Type": "application/json"}
	body := `{"link":"https://example.com/a","title":"A","content":"c","feed_name":"F"}`
	w := performRequest(r, http.MethodPost, "/api/bookmarks", strings.NewReader(body), hdr)
	if w.Code != http.StatusOK {
		t.Fatalf("first create: expected 200, got %d (body=%s)", w.Code, w.Body.String())
	}
	w = performRequest(r, http.MethodPost, "/api/bookmarks", strings.NewReader(body), hdr)
	if w.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d (body=%s)", w.Code, w.Body.String())
	}
}
