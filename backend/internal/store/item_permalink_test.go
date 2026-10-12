package store

import "testing"

func TestBatchCreateItemsIgnoreFillsMissingPermalink(t *testing.T) {
	s, _ := setupTestDB(t)
	defer closeStore(t, s)

	group, err := s.CreateGroup("G")
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	feed, err := s.CreateFeed(group.ID, "Feed", "https://example-news.test/feed", "", "", nil, "feed")
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}

	in := BatchCreateItemInput{GUID: "g1", Title: "T", Link: "https://elsewhere.test/story", Content: "c", PubDate: 100}
	if n, err := s.BatchCreateItemsIgnore(feed.ID, []BatchCreateItemInput{in}); err != nil || n != 1 {
		t.Fatalf("first pull: n=%d err=%v", n, err)
	}
	items, _ := s.ListItems(ListItemsParams{FeedID: &feed.ID})
	if items[0].Permalink != nil {
		t.Fatalf("expected nil permalink, got %q", *items[0].Permalink)
	}

	in.Permalink = "https://example-news.test/item/42"
	if n, err := s.BatchCreateItemsIgnore(feed.ID, []BatchCreateItemInput{in}); err != nil || n != 0 {
		t.Fatalf("second pull must not count the item as new: n=%d err=%v", n, err)
	}
	got, err := s.GetItem(items[0].ID)
	if err != nil {
		t.Fatalf("get item: %v", err)
	}
	if got.Permalink == nil || *got.Permalink != in.Permalink {
		t.Fatalf("expected permalink filled, got %v", got.Permalink)
	}

	// A stored permalink is not overwritten.
	in.Permalink = "https://example-news.test/item/43"
	if _, err := s.BatchCreateItemsIgnore(feed.ID, []BatchCreateItemInput{in}); err != nil {
		t.Fatalf("third pull: %v", err)
	}
	got, _ = s.GetItem(items[0].ID)
	if got.Permalink == nil || *got.Permalink != "https://example-news.test/item/42" {
		t.Fatalf("permalink was overwritten: %v", got.Permalink)
	}
}

func TestFeedOpenPermalinkUpdate(t *testing.T) {
	s, _ := setupTestDB(t)
	defer closeStore(t, s)

	group, _ := s.CreateGroup("G")
	feed, err := s.CreateFeed(group.ID, "Feed", "https://example-news.test/feed", "", "", nil, "feed")
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	if feed.OpenPermalink {
		t.Fatal("open_permalink must default to false")
	}
	on := true
	if err := s.UpdateFeed(feed.ID, UpdateFeedParams{OpenPermalink: &on}); err != nil {
		t.Fatalf("update feed: %v", err)
	}
	if got, _ := s.GetFeed(feed.ID); !got.OpenPermalink {
		t.Fatal("expected open_permalink true")
	}
}
