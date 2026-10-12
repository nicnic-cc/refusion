package handler

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
)

func feverItemIDs(t *testing.T, h *Handler, extra url.Values) []int64 {
	t.Helper()
	r := newTestRouter()
	r.POST("/fever", h.fever)
	extra.Set("items", "1")
	w := performRequest(r, http.MethodPost, "/fever",
		strings.NewReader(feverRequestBody(deriveFeverAPIKey("fusion", "secret"), extra)),
		map[string]string{"Content-Type": "application/x-www-form-urlencoded"})
	var payload struct {
		Items []struct {
			ID int64 `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	ids := []int64{}
	for _, it := range payload.Items {
		ids = append(ids, it.ID)
	}
	return ids
}

// Fever max_id is exclusive: items with id >= max_id must not be returned.
func TestFeverMaxIDIsExclusive(t *testing.T) {
	h, st := newFeverTestHandler(t)
	group, err := st.CreateGroup("Tech")
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	feed, err := st.CreateFeed(group.ID, "Feed", "https://example.com/rss.xml", "https://example.com", "", nil, "feed")
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	var ids []int64
	for i := 1; i <= 3; i++ {
		n := strconv.Itoa(i)
		it, err := st.CreateItem(feed.ID, "guid-"+n, "Entry "+n, "https://example.com/e"+n, "<p>x</p>", int64(1700000000+i))
		if err != nil {
			t.Fatalf("create item: %v", err)
		}
		ids = append(ids, it.ID)
	}
	lowest, highest := ids[0], ids[2]

	got := feverItemIDs(t, h, url.Values{"max_id": {strconv.FormatInt(lowest, 10)}})
	if len(got) != 0 {
		t.Fatalf("max_id=lowest: expected no items, got %v", got)
	}

	got = feverItemIDs(t, h, url.Values{"max_id": {strconv.FormatInt(highest, 10)}})
	for _, id := range got {
		if id == highest {
			t.Fatalf("max_id=highest: result must not include id %d, got %v", highest, got)
		}
	}
}
