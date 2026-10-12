package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestGlobalFilterEndpoints(t *testing.T) {
	h, st := newAnonTestHandler(t, &recordingPuller{})
	router := h.SetupRouter()
	jsonHdr := map[string]string{"Content-Type": "application/json"}

	garden, err := st.CreateFeed(1, "Garden notes", "https://gardennotes.example/feed", "", "", nil, "feed")
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	giveaway, err := st.CreateItem(garden.ID, "g1", "Tomato seed giveaway", "https://gardennotes.example/g1", "", 100)
	if err != nil {
		t.Fatalf("create item: %v", err)
	}
	rule := gin.H{
		"action": "remove", "join": "and", "whole_words": false,
		"conditions": []gin.H{{"trigger": "title", "operator": "contains", "value": "giveaway"}},
	}
	const base = "/api/global-filter"

	w := performRequest(router, http.MethodGet, base, nil, nil)
	if w.Code != http.StatusOK || w.Body.String() != `{"data":null}` {
		t.Fatalf("get without filter: %d %s", w.Code, w.Body.String())
	}

	keep := gin.H{
		"action": "keep", "join": "and",
		"conditions": []gin.H{{"trigger": "title", "operator": "contains", "value": "tomato"}},
	}
	if w := performRequest(router, http.MethodPut, base, mustJSONBody(t, keep), jsonHdr); w.Code != http.StatusBadRequest {
		t.Fatalf("put keep: expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if w := performRequest(router, http.MethodPost, base+"/preview", mustJSONBody(t, keep), jsonHdr); w.Code != http.StatusBadRequest {
		t.Fatalf("preview keep: expected 400, got %d: %s", w.Code, w.Body.String())
	}
	if w := performRequest(router, http.MethodPatch, base, mustJSONBody(t, gin.H{"enabled": false}), jsonHdr); w.Code != http.StatusNotFound {
		t.Fatalf("patch without filter: expected 404, got %d", w.Code)
	}

	w = performRequest(router, http.MethodPost, base+"/preview", mustJSONBody(t, rule), jsonHdr)
	var preview struct {
		Data struct {
			Checked, Hidden int
			Items           []struct {
				FeedName string `json:"feed_name"`
			}
		}
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &preview) != nil ||
		preview.Data.Checked != 1 || preview.Data.Hidden != 1 || preview.Data.Items[0].FeedName != "Garden notes" {
		t.Fatalf("preview: %d %s", w.Code, w.Body.String())
	}

	w = performRequest(router, http.MethodPut, base, mustJSONBody(t, rule), jsonHdr)
	var saved struct {
		Data struct {
			Enabled     bool
			HiddenTotal int `json:"hidden_total"`
		}
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &saved) != nil || !saved.Data.Enabled || saved.Data.HiddenTotal != 1 {
		t.Fatalf("put: %d %s", w.Code, w.Body.String())
	}
	if got, err := st.GetItem(giveaway.ID); err != nil || !got.Filtered {
		t.Fatalf("item after put: filtered %v, %v", got.Filtered, err)
	}

	w = performRequest(router, http.MethodPatch, base, mustJSONBody(t, gin.H{"enabled": false}), jsonHdr)
	if w.Code != http.StatusOK {
		t.Fatalf("patch: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if got, err := st.GetItem(giveaway.ID); err != nil || got.Filtered {
		t.Fatalf("item after switching off: filtered %v, %v", got.Filtered, err)
	}

	if w := performRequest(router, http.MethodDelete, base, nil, nil); w.Code != http.StatusNoContent {
		t.Fatalf("delete: expected 204, got %d", w.Code)
	}
	if w := performRequest(router, http.MethodDelete, base, nil, nil); w.Code != http.StatusNotFound {
		t.Fatalf("second delete: expected 404, got %d", w.Code)
	}
}
