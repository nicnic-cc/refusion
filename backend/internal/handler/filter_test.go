package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFeedFilterEndpoints(t *testing.T) {
	h, st := newAnonTestHandler(t, &recordingPuller{})
	router := h.SetupRouter()
	jsonHdr := map[string]string{"Content-Type": "application/json"}

	feed, err := st.CreateFeed(1, "Cooking blog", "https://cookingblog.example/feed", "", "", nil, false)
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	ad, err := st.CreateItem(feed.ID, "g1", "Sponsored: Ten pans", "https://cookingblog.example/ads/pans", "", 100)
	if err != nil {
		t.Fatalf("create item: %v", err)
	}
	if _, err := st.CreateItem(feed.ID, "g2", "Weeknight soup", "https://cookingblog.example/recipes/soup", "", 200); err != nil {
		t.Fatalf("create item: %v", err)
	}
	base := "/api/feeds/" + strconv.FormatInt(feed.ID, 10) + "/filter"
	rule := gin.H{
		"action": "remove", "join": "and", "whole_words": false,
		"conditions": []gin.H{{"trigger": "title", "operator": "begins_with", "value": "sponsored:"}},
	}

	w := performRequest(router, http.MethodPost, base+"/preview", mustJSONBody(t, rule), jsonHdr)
	var preview struct {
		Data struct {
			Checked, Hidden int
			Items           []struct{ Hidden bool }
		}
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &preview) != nil || preview.Data.Checked != 2 || preview.Data.Hidden != 1 {
		t.Fatalf("preview: %d %s", w.Code, w.Body.String())
	}

	bad := gin.H{"action": "remove", "join": "and", "conditions": []gin.H{{"trigger": "title", "operator": "regex", "value": "("}}}
	if w := performRequest(router, http.MethodPut, base, mustJSONBody(t, bad), jsonHdr); w.Code != http.StatusBadRequest {
		t.Fatalf("put bad rule: expected 400, got %d: %s", w.Code, w.Body.String())
	}

	if w := performRequest(router, http.MethodPut, base, mustJSONBody(t, rule), jsonHdr); w.Code != http.StatusOK {
		t.Fatalf("put: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	itemsURL := "/api/items?feed_id=" + strconv.FormatInt(feed.ID, 10)
	var list struct{ Total int }
	w = performRequest(router, http.MethodGet, itemsURL, nil, nil)
	if json.Unmarshal(w.Body.Bytes(), &list) != nil || list.Total != 1 {
		t.Fatalf("items after put: %s", w.Body.String())
	}
	w = performRequest(router, http.MethodGet, itemsURL+"&include_filtered=true", nil, nil)
	if json.Unmarshal(w.Body.Bytes(), &list) != nil || list.Total != 2 {
		t.Fatalf("items with include_filtered: %s", w.Body.String())
	}
	if w := performRequest(router, http.MethodGet, "/api/items?include_filtered=true", nil, nil); w.Code != http.StatusBadRequest {
		t.Fatalf("include_filtered without feed_id: expected 400, got %d", w.Code)
	}

	w = performRequest(router, http.MethodPatch, base, mustJSONBody(t, gin.H{"enabled": false}), jsonHdr)
	if w.Code != http.StatusOK {
		t.Fatalf("patch: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if got, err := st.GetItem(ad.ID); err != nil || got.Filtered {
		t.Fatalf("item after switching off: filtered %v, %v", got.Filtered, err)
	}

	w = performRequest(router, http.MethodGet, "/api/feed-filters", nil, nil)
	var filters struct{ Total int }
	if json.Unmarshal(w.Body.Bytes(), &filters) != nil || filters.Total != 1 {
		t.Fatalf("list filters: %s", w.Body.String())
	}

	if w := performRequest(router, http.MethodDelete, base, nil, nil); w.Code != http.StatusNoContent {
		t.Fatalf("delete: expected 204, got %d", w.Code)
	}
	if w := performRequest(router, http.MethodDelete, base, nil, nil); w.Code != http.StatusNotFound {
		t.Fatalf("second delete: expected 404, got %d", w.Code)
	}
}
