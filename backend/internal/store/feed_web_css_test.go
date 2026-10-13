package store

import (
	"errors"
	"strings"
	"testing"
)

func TestFeedWebCSS(t *testing.T) {
	s, _ := setupTestDB(t)
	t.Cleanup(func() { closeStore(t, s) })
	group := mustCreateGroup(t, s, "Food")
	feed := mustCreateFeed(t, s, group.ID, "Cooking blog", "https://cookingblog.example/feed", "https://cookingblog.example", "")

	if _, err := s.GetFeedWebCSS(feed.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetFeedWebCSS() before save = %v, want ErrNotFound", err)
	}
	if _, err := s.UpsertFeedWebCSS(feed.ID, "a{}"); err != nil {
		t.Fatal(err)
	}
	saved, err := s.UpsertFeedWebCSS(feed.ID, "b{}")
	if err != nil || saved.CSS != "b{}" {
		t.Fatalf("second save = %+v, %v", saved, err)
	}
	if list, _ := s.ListFeedWebCSS(); len(list) != 1 {
		t.Fatalf("list = %d rows, want 1", len(list))
	}
	if _, err := s.UpsertFeedWebCSS(feed.ID, strings.Repeat("a", MaxFeedWebCSSBytes+1)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("oversized = %v, want ErrInvalid", err)
	}
	if _, err := s.UpsertFeedWebCSS(9999, "a{}"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown feed = %v, want ErrNotFound", err)
	}
	if err := s.DeleteFeedWebCSS(feed.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteFeedWebCSS(feed.ID); err != nil {
		t.Fatalf("second delete = %v, want nil", err)
	}
}

func TestDeletingFeedRemovesItsCSS(t *testing.T) {
	s, _ := setupTestDB(t)
	t.Cleanup(func() { closeStore(t, s) })
	group := mustCreateGroup(t, s, "Food")
	feed := mustCreateFeed(t, s, group.ID, "Cooking blog", "https://cookingblog.example/feed", "https://cookingblog.example", "")
	if _, err := s.UpsertFeedWebCSS(feed.ID, "a{}"); err != nil {
		t.Fatal(err)
	}

	if err := s.DeleteFeed(feed.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.ListFeedWebCSS(); len(list) != 0 {
		t.Fatalf("css rows left after feed delete: %d", len(list))
	}
}
