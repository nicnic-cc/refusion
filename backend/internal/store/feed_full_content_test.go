package store

import "testing"

func TestFeedFullContentLifecycle(t *testing.T) {
	s, _ := setupTestDB(t)
	defer closeStore(t, s)

	group, err := s.CreateGroup("G")
	if err != nil {
		t.Fatalf("create group: %v", err)
	}

	feed, err := s.CreateFeed(group.ID, "Feed", "https://example.com/feed", "", "", nil, true)
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	got, err := s.GetFeed(feed.ID)
	if err != nil {
		t.Fatalf("get feed: %v", err)
	}
	if !got.FullContent {
		t.Fatal("expected full_content true after create")
	}

	// Absent param leaves the flag untouched.
	if err := s.UpdateFeed(feed.ID, UpdateFeedParams{}); err != nil {
		t.Fatalf("update feed: %v", err)
	}
	if got, _ = s.GetFeed(feed.ID); !got.FullContent {
		t.Fatal("expected full_content to persist when not updated")
	}

	off := false
	if err := s.UpdateFeed(feed.ID, UpdateFeedParams{FullContent: &off}); err != nil {
		t.Fatalf("update feed: %v", err)
	}
	if got, _ = s.GetFeed(feed.ID); got.FullContent {
		t.Fatal("expected full_content false after toggling off")
	}

	on := true
	if err := s.UpdateFeed(feed.ID, UpdateFeedParams{FullContent: &on}); err != nil {
		t.Fatalf("update feed: %v", err)
	}
	if got, _ = s.GetFeed(feed.ID); !got.FullContent {
		t.Fatal("expected full_content true after toggling on")
	}
}
