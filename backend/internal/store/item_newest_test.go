package store

import "testing"

func TestCountItemsAfter(t *testing.T) {
	store, _ := setupTestDB(t)
	defer closeStore(t, store)

	empty, err := store.MaxItemID()
	if err != nil || empty != 0 {
		t.Fatalf("MaxItemID() on empty store = %d, %v; want 0", empty, err)
	}

	groupA := mustCreateGroup(t, store, "A")
	groupB := mustCreateGroup(t, store, "B")
	feedA := mustCreateFeed(t, store, groupA.ID, "Feed A", "https://example.com/a", "https://example.com", "")
	feedB := mustCreateFeed(t, store, groupB.ID, "Feed B", "https://example.com/b", "https://example.com", "")

	mustCreateItem(t, store, feedA.ID, "a1", "A1", "https://example.com/a1", "", 100)
	mustCreateItem(t, store, feedB.ID, "b1", "B1", "https://example.com/b1", "", 100)

	snapshot, err := store.MaxItemID()
	if err != nil || snapshot == 0 {
		t.Fatalf("MaxItemID() = %d, %v; want > 0", snapshot, err)
	}

	mustCreateItem(t, store, feedA.ID, "a2", "A2", "https://example.com/a2", "", 50)
	mustCreateItem(t, store, feedA.ID, "a3", "A3", "https://example.com/a3", "", 300)
	mustCreateItem(t, store, feedB.ID, "b2", "B2", "https://example.com/b2", "", 400)

	tests := []struct {
		name    string
		feedID  *int64
		groupID *int64
		want    int
	}{
		{"all feeds", nil, nil, 3},
		{"one feed", &feedA.ID, nil, 2},
		{"one group", nil, &groupB.ID, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := store.CountItemsAfter(snapshot, tt.feedID, tt.groupID)
			if err != nil {
				t.Fatalf("CountItemsAfter() failed: %v", err)
			}
			if got != tt.want {
				t.Errorf("CountItemsAfter() = %d, want %d", got, tt.want)
			}
		})
	}

	all, err := store.CountItemsAfter(0, nil, nil)
	if err != nil || all != 5 {
		t.Errorf("CountItemsAfter(0) = %d, %v; want 5", all, err)
	}
}
