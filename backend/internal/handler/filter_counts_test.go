package handler

import (
	"net/http"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHiddenCountsEndpoint(t *testing.T) {
	h, st := newAnonTestHandler(t, &recordingPuller{})
	router := h.SetupRouter()
	jsonHdr := map[string]string{"Content-Type": "application/json"}

	garden, err := st.CreateFeed(1, "Garden notes", "https://gardennotes.example/feed", "", "", nil, "feed")
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	if _, err := st.CreateItem(garden.ID, "g1", "Tomato seed giveaway", "https://gardennotes.example/g1", "", 100); err != nil {
		t.Fatalf("create item: %v", err)
	}
	if w := performRequest(router, http.MethodGet, "/api/filters/hidden-counts", nil, nil); w.Body.String() != `{"data":{}}` {
		t.Fatalf("before any filter: %d %s", w.Code, w.Body.String())
	}

	rule := gin.H{
		"action": "remove", "join": "and",
		"conditions": []gin.H{{"trigger": "title", "operator": "contains", "value": "giveaway"}},
	}
	if w := performRequest(router, http.MethodPut, "/api/global-filter", mustJSONBody(t, rule), jsonHdr); w.Code != http.StatusOK {
		t.Fatalf("put global filter: %d %s", w.Code, w.Body.String())
	}
	w := performRequest(router, http.MethodGet, "/api/filters/hidden-counts", nil, nil)
	want := `{"data":{"` + strconv.FormatInt(garden.ID, 10) + `":{"feed":0,"group":0,"global":1}}}`
	if w.Body.String() != want {
		t.Fatalf("hidden counts = %s, want %s", w.Body.String(), want)
	}
}
