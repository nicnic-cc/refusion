package store

import "testing"

func TestMarkScopeRead(t *testing.T) {
	tests := []struct {
		name       string
		feed       bool
		group      bool
		wantUnread []string
	}{
		{"one feed", true, false, []string{"a-new", "b-old", "c-old"}},
		{"one group", false, true, []string{"a-new", "c-old"}},
		{"everything", false, false, []string{"a-new"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, _ := setupTestDB(t)
			defer closeStore(t, store)

			groupAB := mustCreateGroup(t, store, "AB")
			groupC := mustCreateGroup(t, store, "C")
			feedA := mustCreateFeed(t, store, groupAB.ID, "A", "https://example.com/a", "https://example.com", "")
			feedB := mustCreateFeed(t, store, groupAB.ID, "B", "https://example.com/b", "https://example.com", "")
			feedC := mustCreateFeed(t, store, groupC.ID, "C", "https://example.com/c", "https://example.com", "")

			// More than one page of old items, so a page-sized mark would miss some.
			for i := range 30 {
				mustCreateItem(t, store, feedA.ID, "a-old-"+string(rune('a'+i)), "a-old", "https://example.com/a", "", int64(i))
			}
			mustCreateItem(t, store, feedB.ID, "b-old", "b-old", "https://example.com/b", "", 1)
			mustCreateItem(t, store, feedC.ID, "c-old", "c-old", "https://example.com/c", "", 1)
			snapshot, err := store.MaxItemID()
			if err != nil {
				t.Fatal(err)
			}
			mustCreateItem(t, store, feedA.ID, "a-new", "a-new", "https://example.com/an", "", 1)

			var feedID, groupID *int64
			if tt.feed {
				feedID = &feedA.ID
			}
			if tt.group {
				groupID = &groupAB.ID
			}
			if err := store.MarkScopeRead(snapshot, feedID, groupID); err != nil {
				t.Fatalf("MarkScopeRead() failed: %v", err)
			}

			unread := true
			items, err := store.ListItems(ListItemsParams{Unread: &unread})
			if err != nil {
				t.Fatal(err)
			}
			got := map[string]bool{}
			for _, it := range items {
				got[it.Title] = true
			}
			if len(got) != len(tt.wantUnread) {
				t.Errorf("unread titles = %v, want %v", got, tt.wantUnread)
			}
			for _, title := range tt.wantUnread {
				if !got[title] {
					t.Errorf("%q should stay unread; unread = %v", title, got)
				}
			}
		})
	}
}
