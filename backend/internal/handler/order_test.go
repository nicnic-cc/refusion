package handler

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestReorderEndpoints(t *testing.T) {
	h, st := newAnonTestHandler(t, &recordingPuller{})
	router := h.SetupRouter()
	json := map[string]string{"Content-Type": "application/json"}

	g2, err := st.CreateGroup("g2")
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	a, err := st.CreateFeed(g2.ID, "a", "https://a", "", "", nil, "feed")
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	b, err := st.CreateFeed(g2.ID, "b", "https://b", "", "", nil, "feed")
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	other, err := st.CreateFeed(1, "o", "https://o", "", "", nil, "feed")
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}

	groupOrder := func() []int64 {
		groups, err := st.ListGroups()
		if err != nil {
			t.Fatalf("list groups: %v", err)
		}
		ids := []int64{}
		for _, g := range groups {
			ids = append(ids, g.ID)
		}
		return ids
	}
	feedOrder := func() []int64 {
		feeds, err := st.ListFeeds()
		if err != nil {
			t.Fatalf("list feeds: %v", err)
		}
		ids := []int64{}
		for _, f := range feeds {
			if f.GroupID == g2.ID {
				ids = append(ids, f.ID)
			}
		}
		return ids
	}

	w := performRequest(router, http.MethodPut, "/api/groups/order", mustJSONBody(t, gin.H{"ids": []int64{g2.ID, 1}}), json)
	if w.Code != http.StatusNoContent {
		t.Fatalf("reorder groups: expected 204, got %d: %s", w.Code, w.Body.String())
	}
	w = performRequest(router, http.MethodPut, "/api/feeds/order", mustJSONBody(t, gin.H{"group_id": g2.ID, "ids": []int64{b.ID, a.ID}}), json)
	if w.Code != http.StatusNoContent {
		t.Fatalf("reorder feeds: expected 204, got %d: %s", w.Code, w.Body.String())
	}
	wantGroups, wantFeeds := []int64{g2.ID, 1}, []int64{b.ID, a.ID}
	if got := groupOrder(); !reflect.DeepEqual(got, wantGroups) {
		t.Fatalf("groups = %v, want %v", got, wantGroups)
	}
	if got := feedOrder(); !reflect.DeepEqual(got, wantFeeds) {
		t.Fatalf("feeds = %v, want %v", got, wantFeeds)
	}

	badGroups := []gin.H{
		{"ids": []int64{g2.ID}},
		{"ids": []int64{g2.ID, 1, 99}},
		{"ids": []int64{g2.ID, g2.ID}},
		{},
	}
	for _, body := range badGroups {
		w := performRequest(router, http.MethodPut, "/api/groups/order", mustJSONBody(t, body), json)
		if w.Code != http.StatusBadRequest {
			t.Errorf("groups %v: expected 400, got %d", body, w.Code)
		}
	}
	badFeeds := []gin.H{
		{"group_id": g2.ID, "ids": []int64{a.ID}},
		{"group_id": g2.ID, "ids": []int64{a.ID, b.ID, 99}},
		{"group_id": g2.ID, "ids": []int64{a.ID, a.ID}},
		{"group_id": g2.ID, "ids": []int64{a.ID, other.ID}},
		{"ids": []int64{a.ID, b.ID}},
	}
	for _, body := range badFeeds {
		w := performRequest(router, http.MethodPut, "/api/feeds/order", mustJSONBody(t, body), json)
		if w.Code != http.StatusBadRequest {
			t.Errorf("feeds %v: expected 400, got %d", body, w.Code)
		}
	}

	if got := groupOrder(); !reflect.DeepEqual(got, wantGroups) {
		t.Errorf("groups changed by rejected calls: %v", got)
	}
	if got := feedOrder(); !reflect.DeepEqual(got, wantFeeds) {
		t.Errorf("feeds changed by rejected calls: %v", got)
	}
}
