package store

import (
	"database/sql"
	"path/filepath"
	"testing"
)

// A legacy non-default group named "Default" must not break migration or drop its feeds.
func TestMigrateLegacyGroupNamedDefault(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE groups (id INTEGER PRIMARY KEY, created_at TEXT, updated_at TEXT, deleted_at INTEGER, name TEXT NOT NULL);
		CREATE UNIQUE INDEX idx_name ON groups(deleted_at, name);
		CREATE TABLE feeds (id INTEGER PRIMARY KEY, created_at TEXT, updated_at TEXT, deleted_at INTEGER, name TEXT NOT NULL,
			link TEXT NOT NULL, last_build TEXT, failure TEXT DEFAULT '', consecutive_failures INTEGER DEFAULT 0,
			suspended INTEGER DEFAULT 0, req_proxy TEXT, group_id INTEGER);
		CREATE UNIQUE INDEX idx_link ON feeds(deleted_at, link);
		CREATE TABLE items (id INTEGER PRIMARY KEY, created_at TEXT, updated_at TEXT, deleted_at INTEGER, title TEXT, guid TEXT,
			link TEXT, content TEXT, pub_date TEXT, unread INTEGER DEFAULT 1, bookmark INTEGER DEFAULT 0, feed_id INTEGER);
		CREATE UNIQUE INDEX idx_guid ON items(deleted_at, guid, feed_id);
		INSERT INTO groups (id, created_at, updated_at, deleted_at, name) VALUES
			(1, '2024-01-01 00:00:00', '2024-01-01 00:00:00', NULL, 'Home'),
			(5, '2024-01-01 00:00:00', '2024-01-01 00:00:00', NULL, 'Default');
		INSERT INTO feeds (id, created_at, updated_at, deleted_at, name, link, group_id) VALUES
			(1, '2024-02-01 00:00:00', '2024-02-01 00:00:00', NULL, 'Feed X', 'https://legacy.example/x.xml', 5);
	`)
	if err != nil {
		t.Fatalf("seed legacy db: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	st, err := New(dbPath)
	if err != nil {
		t.Fatalf("New() failed: %v", err)
	}
	defer closeStore(t, st)

	var n int
	if err := st.db.QueryRow(`SELECT COUNT(*) FROM feeds WHERE link = 'https://legacy.example/x.xml'`).Scan(&n); err != nil {
		t.Fatalf("query feed: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected migrated feed to exist, count=%d", n)
	}

	var feedGroup string
	if err := st.db.QueryRow(`SELECT g.name FROM feeds f JOIN groups g ON g.id = f.group_id WHERE f.link = 'https://legacy.example/x.xml'`).Scan(&feedGroup); err != nil {
		t.Fatalf("query feed group: %v", err)
	}
	if feedGroup != "Default" {
		t.Fatalf("feed group = %q, want %q", feedGroup, "Default")
	}

	var homeID int64
	if err := st.db.QueryRow(`SELECT id FROM groups WHERE name = 'Home'`).Scan(&homeID); err != nil {
		t.Fatalf("query Home group: %v", err)
	}
	if homeID != 1 {
		t.Fatalf("Home group id = %d, want 1", homeID)
	}
}
