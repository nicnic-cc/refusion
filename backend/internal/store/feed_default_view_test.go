package store

import (
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestFeedDefaultViewLifecycle(t *testing.T) {
	s, _ := setupTestDB(t)
	defer closeStore(t, s)

	group, err := s.CreateGroup("G")
	if err != nil {
		t.Fatalf("create group: %v", err)
	}

	feed, err := s.CreateFeed(group.ID, "Feed", "https://example.com/feed", "", "", nil, "web")
	if err != nil {
		t.Fatalf("create feed: %v", err)
	}
	if feed.DefaultView != "web" {
		t.Fatalf("expected default_view web after create, got %q", feed.DefaultView)
	}

	// Absent param leaves the view untouched.
	if err := s.UpdateFeed(feed.ID, UpdateFeedParams{}); err != nil {
		t.Fatalf("update feed: %v", err)
	}
	if got, _ := s.GetFeed(feed.ID); got.DefaultView != "web" {
		t.Fatalf("expected default_view to persist, got %q", got.DefaultView)
	}

	full := "full"
	if err := s.UpdateFeed(feed.ID, UpdateFeedParams{DefaultView: &full}); err != nil {
		t.Fatalf("update feed: %v", err)
	}
	if got, _ := s.GetFeed(feed.ID); got.DefaultView != "full" {
		t.Fatalf("expected default_view full, got %q", got.DefaultView)
	}

	bad := "pdf"
	if err := s.UpdateFeed(feed.ID, UpdateFeedParams{DefaultView: &bad}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid on update, got %v", err)
	}
	if _, err := s.CreateFeed(group.ID, "Bad", "https://example.com/bad", "", "", nil, bad); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid on create, got %v", err)
	}
}

// Builds a database at the state before migration 905 by applying only the
// earlier files, then lets migrate() run the rest.
func TestMigrateFeedDefaultView(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "old.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	s := &Store{db: db}
	defer closeStore(t, s)

	if err := s.createMigrationsTable(); err != nil {
		t.Fatalf("create migrations table: %v", err)
	}
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		t.Fatalf("read migrations: %v", err)
	}
	for _, e := range entries { // ReadDir returns files sorted by name
		version, err := extractVersion(e.Name())
		if err != nil {
			t.Fatalf("version of %s: %v", e.Name(), err)
		}
		if version >= 905 {
			break
		}
		if err := s.applyMigration(version, e.Name()); err != nil {
			t.Fatalf("apply %s: %v", e.Name(), err)
		}
	}

	if _, err := db.Exec(`
		INSERT INTO feeds (group_id, name, link, full_content) VALUES
			(1, 'full one', 'https://a.example/feed', 1),
			(1, 'plain one', 'https://b.example/feed', 0)`); err != nil {
		t.Fatalf("seed feeds: %v", err)
	}

	if err := s.migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	views := map[string]string{}
	rows, err := db.Query(`SELECT name, default_view FROM feeds`)
	if err != nil {
		t.Fatalf("query default_view: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var name, view string
		if err := rows.Scan(&name, &view); err != nil {
			t.Fatalf("scan: %v", err)
		}
		views[name] = view
	}
	if views["full one"] != "full" || views["plain one"] != "feed" {
		t.Fatalf("unexpected views after migration: %v", views)
	}

	_, err = db.Query(`SELECT full_content FROM feeds`)
	if err == nil || !strings.Contains(err.Error(), "full_content") {
		t.Fatalf("expected full_content column to be gone, got err=%v", err)
	}
}
