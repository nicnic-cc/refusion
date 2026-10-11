package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// A batch with one bad link still imports the valid feed and reports the bad one as failed.
func TestBatchCreateFeedsPartialSuccess(t *testing.T) {
	h, st := newFeverTestHandler(t)
	h.config.AllowPrivateFeeds = true
	group, err := st.CreateGroup("Tech")
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	r := newTestRouter()
	r.POST("/api/feeds/batch", h.batchCreateFeeds)

	body := mustJSONBody(t, map[string]any{"feeds": []map[string]any{
		{"group_id": group.ID, "name": "Good", "link": "http://127.0.0.1:1/a.xml"},
		{"group_id": group.ID, "name": "Bad", "link": "feed://x"},
	}})
	w := performRequest(r, http.MethodPost, "/api/feeds/batch", body, map[string]string{"Content-Type": "application/json"})
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	var resp struct {
		Data struct {
			Created int `json:"created"`
			Failed  int `json:"failed"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Data.Created != 1 || resp.Data.Failed != 1 {
		t.Fatalf("expected created=1 failed=1, got %+v", resp.Data)
	}
}
