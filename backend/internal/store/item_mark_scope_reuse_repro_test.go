package store

import "testing"

// Items created after the snapshot must stay unread even when SQLite reuses
// the ids of a deleted feed's items (ids must never be reused).
func TestMarkScopeReadSkipsItemsReusingDeletedIDs(t *testing.T) {
	store, _ := setupTestDB(t)
	defer closeStore(t, store)

	group := mustCreateGroup(t, store, "Reuse")
	feedA := mustCreateFeed(t, store, group.ID, "Gardening Weekly", "https://example.com/a", "https://example.com", "")
	feedB := mustCreateFeed(t, store, group.ID, "Cooking Daily", "https://example.com/b", "https://example.com", "")

	mustCreateItem(t, store, feedA.ID, "a-old", "a-old", "https://example.com/a1", "", 1)
	mustCreateItem(t, store, feedB.ID, "b-old", "b-old", "https://example.com/b1", "", 1)

	snapshot, err := store.MaxItemID()
	if err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteFeed(feedB.ID); err != nil {
		t.Fatal(err)
	}
	mustCreateItem(t, store, feedA.ID, "a-new", "a-new", "https://example.com/a2", "", 1)

	if err := store.MarkScopeRead(snapshot, nil, nil); err != nil {
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
	if !got["a-new"] {
		t.Errorf("a-new was marked read although created after the snapshot; unread = %v", got)
	}
	// Control: the item that existed at snapshot time is marked read.
	if got["a-old"] {
		t.Errorf("control: a-old should be read, unread = %v", got)
	}
}
