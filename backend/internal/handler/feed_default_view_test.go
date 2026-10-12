package handler

import (
	"net/http"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFeedDefaultViewEndpoints(t *testing.T) {
	h, st := newAnonTestHandler(t, &recordingPuller{})
	router := h.SetupRouter()
	jsonHeader := map[string]string{"Content-Type": "application/json"}

	create := func(extra gin.H, link string) int {
		body := gin.H{"group_id": 1, "name": link, "link": link}
		for k, v := range extra {
			body[k] = v
		}
		return performRequest(router, http.MethodPost, "/api/feeds", mustJSONBody(t, body), jsonHeader).Code
	}

	if code := create(nil, "https://example.com/a.xml"); code != http.StatusOK {
		t.Fatalf("create without default_view: got %d", code)
	}
	if code := create(gin.H{"default_view": "web"}, "https://example.com/b.xml"); code != http.StatusOK {
		t.Fatalf("create with web: got %d", code)
	}
	if code := create(gin.H{"default_view": "pdf"}, "https://example.com/c.xml"); code != http.StatusBadRequest {
		t.Fatalf("create with invalid view: expected 400, got %d", code)
	}

	feeds, err := st.ListFeeds()
	if err != nil || len(feeds) != 2 {
		t.Fatalf("list feeds: %v (len=%d)", err, len(feeds))
	}
	if feeds[0].DefaultView != "feed" || feeds[1].DefaultView != "web" {
		t.Fatalf("unexpected views: %q, %q", feeds[0].DefaultView, feeds[1].DefaultView)
	}

	path := "/api/feeds/" + strconv.FormatInt(feeds[0].ID, 10)
	w := performRequest(router, http.MethodPatch, path, mustJSONBody(t, gin.H{"default_view": "full"}), jsonHeader)
	if w.Code != http.StatusOK {
		t.Fatalf("update to full: got %d: %s", w.Code, w.Body.String())
	}
	w = performRequest(router, http.MethodPatch, path, mustJSONBody(t, gin.H{"default_view": "bogus"}), jsonHeader)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("update with invalid view: expected 400, got %d", w.Code)
	}
	if got, _ := st.GetFeed(feeds[0].ID); got.DefaultView != "full" {
		t.Fatalf("invalid update changed the view to %q", got.DefaultView)
	}
}
