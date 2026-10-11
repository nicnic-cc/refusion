package store

import (
	"errors"
	"testing"

	"github.com/0x2E/fusion/internal/filter"
)

func removeSponsored() filter.Rule {
	return filter.Rule{
		Action: filter.ActionRemove, Join: filter.JoinAnd,
		Conditions: []filter.Condition{{Trigger: filter.TriggerTitle, Operator: filter.OpBeginsWith, Value: "Sponsored:"}},
	}
}

// setupFilterFeed creates a cooking feed with two normal articles and one ad.
func setupFilterFeed(t *testing.T) (*Store, int64, int64) {
	t.Helper()
	s, _ := setupTestDB(t)
	t.Cleanup(func() { closeStore(t, s) })

	group := mustCreateGroup(t, s, "Food")
	feed := mustCreateFeed(t, s, group.ID, "Cooking blog", "https://cookingblog.example/feed", "https://cookingblog.example", "")
	mustCreateItem(t, s, feed.ID, "g1", "Weeknight soup", "https://cookingblog.example/recipes/soup", "<p>Simmer lentils.</p>", 300)
	ad := mustCreateItem(t, s, feed.ID, "g2", "Sponsored: Ten pans", "https://cookingblog.example/ads/pans", "<p>Buy pans.</p>", 200)
	mustCreateItem(t, s, feed.ID, "g3", "Pasta bake", "https://cookingblog.example/recipes/pasta", "<p>Bake pasta.</p>", 100)
	return s, feed.ID, ad.ID
}

func itemIDs(t *testing.T, s *Store, params ListItemsParams) map[int64]bool {
	t.Helper()
	items, err := s.ListItems(params)
	if err != nil {
		t.Fatalf("ListItems() failed: %v", err)
	}
	ids := map[int64]bool{}
	for _, i := range items {
		ids[i.ID] = true
	}
	return ids
}

func TestFilteredItemIsHiddenEverywhere(t *testing.T) {
	s, feedID, adID := setupFilterFeed(t)

	if _, err := s.UpsertFeedFilter(feedID, removeSponsored(), true); err != nil {
		t.Fatalf("UpsertFeedFilter() failed: %v", err)
	}

	if itemIDs(t, s, ListItemsParams{FeedID: &feedID})[adID] {
		t.Error("ListItems returned the filtered item")
	}
	if !itemIDs(t, s, ListItemsParams{FeedID: &feedID, IncludeFiltered: true})[adID] {
		t.Error("ListItems with IncludeFiltered did not return the filtered item")
	}
	if n, _ := s.CountItems(ListItemsParams{FeedID: &feedID}); n != 2 {
		t.Errorf("CountItems() = %d, want 2", n)
	}
	if n, _ := s.CountItems(ListItemsParams{FeedID: &feedID, IncludeFiltered: true}); n != 3 {
		t.Errorf("CountItems(IncludeFiltered) = %d, want 3", n)
	}

	feeds, err := s.ListFeeds()
	if err != nil {
		t.Fatalf("ListFeeds() failed: %v", err)
	}
	if feeds[0].ItemCount != 2 || feeds[0].UnreadCount != 2 {
		t.Errorf("feed counts = %d items, %d unread; want 2 and 2", feeds[0].ItemCount, feeds[0].UnreadCount)
	}

	fever, err := s.ListFeverItems(ListFeverItemsParams{})
	if err != nil {
		t.Fatalf("ListFeverItems() failed: %v", err)
	}
	for _, i := range fever {
		if i.ID == adID {
			t.Error("ListFeverItems returned the filtered item")
		}
	}
	withID, err := s.ListFeverItems(ListFeverItemsParams{WithIDs: []int64{adID}})
	if err != nil || len(withID) != 0 {
		t.Errorf("ListFeverItems(with_ids) = %d items, %v; want none", len(withID), err)
	}
	unread, err := s.ListUnreadItemIDs()
	if err != nil || len(unread) != 2 {
		t.Errorf("ListUnreadItemIDs() = %v, %v; want 2 ids", unread, err)
	}

	for _, q := range []string{"pans", " "} { // " " takes the LIKE fallback
		res, err := s.SearchItems(q, 10)
		if err != nil {
			t.Fatalf("SearchItems(%q) failed: %v", q, err)
		}
		for _, r := range res {
			if r.ID == adID {
				t.Errorf("SearchItems(%q) returned the filtered item", q)
			}
		}
	}

	if n, _ := s.CountItemsAfter(0, &feedID, nil); n != 2 {
		t.Errorf("CountItemsAfter() = %d, want 2", n)
	}
}

func TestMarkAllReadSkipsFilteredItems(t *testing.T) {
	s, feedID, adID := setupFilterFeed(t)
	if _, err := s.UpsertFeedFilter(feedID, removeSponsored(), true); err != nil {
		t.Fatal(err)
	}

	if err := s.MarkScopeRead(1000, &feedID, nil); err != nil {
		t.Fatalf("MarkScopeRead() failed: %v", err)
	}
	item, _ := s.GetItem(adID)
	if !item.Unread || !item.Filtered {
		t.Errorf("filtered item = unread %v, filtered %v; want both true", item.Unread, item.Filtered)
	}

	// Removing the filter brings the article back with its unread state.
	if err := s.DeleteFeedFilter(feedID); err != nil {
		t.Fatal(err)
	}
	if !itemIDs(t, s, ListItemsParams{FeedID: &feedID})[adID] {
		t.Error("article did not come back after deleting the filter")
	}
}

func TestFilterRecomputeHidesAndUnhides(t *testing.T) {
	s, feedID, adID := setupFilterFeed(t)

	saved, err := s.UpsertFeedFilter(feedID, removeSponsored(), true)
	if err != nil {
		t.Fatal(err)
	}
	if saved.HiddenCount != 1 {
		t.Errorf("HiddenCount = %d, want 1", saved.HiddenCount)
	}

	if _, err := s.SetFeedFilterEnabled(feedID, false); err != nil {
		t.Fatal(err)
	}
	if !itemIDs(t, s, ListItemsParams{FeedID: &feedID})[adID] {
		t.Error("switching the filter off did not restore the article")
	}

	if _, err := s.SetFeedFilterEnabled(feedID, true); err != nil {
		t.Fatal(err)
	}
	if itemIDs(t, s, ListItemsParams{FeedID: &feedID})[adID] {
		t.Error("switching the filter on did not hide the article")
	}

	// Keep mode inverts: only recipes URLs stay.
	keep := filter.Rule{
		Action: filter.ActionKeep, Join: filter.JoinAnd,
		Conditions: []filter.Condition{{Trigger: filter.TriggerURLPath, Operator: filter.OpBeginsWith, Value: "/recipes/"}},
	}
	if _, err := s.UpsertFeedFilter(feedID, keep, true); err != nil {
		t.Fatal(err)
	}
	if got := itemIDs(t, s, ListItemsParams{FeedID: &feedID}); len(got) != 2 || got[adID] {
		t.Errorf("keep filter left %v, want the two recipes", got)
	}

	filters, err := s.ListFeedFilters()
	if err != nil || len(filters) != 1 || filters[0].HiddenCount != 1 {
		t.Errorf("ListFeedFilters() = %+v, %v; want one filter hiding 1", filters, err)
	}
}

func TestPullAppliesFilterToNewItems(t *testing.T) {
	s, feedID, _ := setupFilterFeed(t)
	if _, err := s.UpsertFeedFilter(feedID, removeSponsored(), true); err != nil {
		t.Fatal(err)
	}

	inputs := []BatchCreateItemInput{
		{GUID: "n1", Title: "Sponsored: New pans", Link: "https://cookingblog.example/ads/new", PubDate: 400},
		{GUID: "n2", Title: "Fresh bread", Link: "https://cookingblog.example/recipes/bread", PubDate: 401},
	}
	if err := s.MarkFilteredInputs(feedID, inputs); err != nil {
		t.Fatal(err)
	}
	created, err := s.BatchCreateItemsIgnore(feedID, inputs)
	if err != nil {
		t.Fatal(err)
	}
	if created != 1 {
		t.Errorf("created = %d, want 1 (the ad does not count as new)", created)
	}
	if n, _ := s.CountItems(ListItemsParams{FeedID: &feedID}); n != 3 {
		t.Errorf("CountItems() = %d, want 3", n)
	}
}

func TestUpsertFeedFilterRejectsBadRule(t *testing.T) {
	s, feedID, _ := setupFilterFeed(t)

	bad := removeSponsored()
	bad.Conditions[0].Operator = filter.OpRegex
	bad.Conditions[0].Value = "("
	if _, err := s.UpsertFeedFilter(feedID, bad, true); !errors.Is(err, ErrInvalid) {
		t.Errorf("UpsertFeedFilter(bad regex) = %v, want ErrInvalid", err)
	}
	if _, err := s.UpsertFeedFilter(9999, removeSponsored(), true); !errors.Is(err, ErrNotFound) {
		t.Errorf("UpsertFeedFilter(unknown feed) = %v, want ErrNotFound", err)
	}
	if _, err := s.SetFeedFilterEnabled(feedID, true); !errors.Is(err, ErrNotFound) {
		t.Errorf("SetFeedFilterEnabled(no filter) = %v, want ErrNotFound", err)
	}
}

func TestPreviewFilter(t *testing.T) {
	s, feedID, adID := setupFilterFeed(t)

	preview, err := s.PreviewFilter(feedID, removeSponsored())
	if err != nil {
		t.Fatal(err)
	}
	if preview.Checked != 3 || preview.Hidden != 1 || len(preview.Items) != 3 {
		t.Fatalf("preview = %d checked, %d hidden, %d listed; want 3, 1, 3", preview.Checked, preview.Hidden, len(preview.Items))
	}
	if preview.Items[0].Title != "Weeknight soup" || preview.Items[1].ID != adID || !preview.Items[1].Hidden {
		t.Errorf("preview items = %+v", preview.Items)
	}
	// A preview saves nothing.
	if n, _ := s.CountItems(ListItemsParams{FeedID: &feedID}); n != 3 {
		t.Errorf("CountItems() after preview = %d, want 3", n)
	}
}

func TestDeletingFeedDeletesItsFilter(t *testing.T) {
	s, feedID, _ := setupFilterFeed(t)
	if _, err := s.UpsertFeedFilter(feedID, removeSponsored(), true); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteFeed(feedID); err != nil {
		t.Fatal(err)
	}
	if filters, err := s.ListFeedFilters(); err != nil || len(filters) != 0 {
		t.Errorf("ListFeedFilters() = %v, %v; want none", filters, err)
	}
}
