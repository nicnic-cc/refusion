package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// Links that already exist are reported as duplicates, not as failures.
func TestBatchCreateFeedsCountsDuplicatesSeparately(t *testing.T) {
	h, st := newFeverTestHandler(t)
	h.config.AllowPrivateFeeds = true
	group, err := st.CreateGroup("Tech")
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	r := newTestRouter()
	r.POST("/api/feeds/batch", h.batchCreateFeeds)

	post := func(feeds []map[string]any) (created, failed, duplicates int, errs []string) {
		t.Helper()
		body := mustJSONBody(t, map[string]any{"feeds": feeds})
		w := performRequest(r, http.MethodPost, "/api/feeds/batch", body, map[string]string{"Content-Type": "application/json"})
		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
		}
		var resp struct {
			Data struct {
				Created    int      `json:"created"`
				Failed     int      `json:"failed"`
				Duplicates int      `json:"duplicates"`
				Errors     []string `json:"errors"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		d := resp.Data
		return d.Created, d.Failed, d.Duplicates, d.Errors
	}

	feeds := []map[string]any{
		{"group_id": group.ID, "name": "A", "link": "http://127.0.0.1:1/a.xml"},
		{"group_id": group.ID, "name": "B", "link": "http://127.0.0.1:1/b.xml"},
	}
	if created, failed, dups, _ := post(feeds); created != 2 || failed != 0 || dups != 0 {
		t.Fatalf("first import: created=%d failed=%d duplicates=%d", created, failed, dups)
	}

	// Re-importing the same file adds nothing and fails nothing.
	created, failed, dups, errs := post(feeds)
	if created != 0 || failed != 0 || dups != 2 || len(errs) != 0 {
		t.Fatalf("re-import: created=%d failed=%d duplicates=%d errors=%v", created, failed, dups, errs)
	}

	// A bad link still counts as failed next to a duplicate.
	feeds = append(feeds, map[string]any{"group_id": group.ID, "name": "Bad", "link": "feed://x"})
	created, failed, dups, errs = post(feeds)
	if created != 0 || failed != 1 || dups != 2 || len(errs) != 1 {
		t.Fatalf("mixed import: created=%d failed=%d duplicates=%d errors=%v", created, failed, dups, errs)
	}
}
