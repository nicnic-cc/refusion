package store

import (
	"errors"
	"reflect"
	"testing"
)

func groupIDs(t *testing.T, s *Store) []int64 {
	t.Helper()
	groups, err := s.ListGroups()
	if err != nil {
		t.Fatalf("ListGroups() failed: %v", err)
	}
	ids := []int64{}
	for _, g := range groups {
		ids = append(ids, g.ID)
	}
	return ids
}

func feedIDsIn(t *testing.T, s *Store, groupID int64) []int64 {
	t.Helper()
	feeds, err := s.ListFeeds()
	if err != nil {
		t.Fatalf("ListFeeds() failed: %v", err)
	}
	ids := []int64{}
	for _, f := range feeds {
		if f.GroupID == groupID {
			ids = append(ids, f.ID)
		}
	}
	return ids
}

func TestOrderMigrationKeepsIDOrder(t *testing.T) {
	s, _ := setupTestDB(t)
	defer closeStore(t, s)

	// Rewind to the pre-902 schema, then insert rows with out-of-order ids.
	for _, stmt := range []string{
		`DROP TRIGGER groups_position_ai`,
		`DROP TRIGGER feeds_position_ai`,
		`DROP TRIGGER feeds_position_group_au`,
		`ALTER TABLE groups DROP COLUMN position`,
		`ALTER TABLE feeds DROP COLUMN position`,
		`DELETE FROM schema_migrations WHERE version = 902`,
		`INSERT INTO groups (id, name) VALUES (7, 'g7'), (3, 'g3')`,
		`INSERT INTO feeds (id, group_id, name, link) VALUES
			(9, 3, 'a', 'https://a'), (2, 3, 'b', 'https://b'), (5, 7, 'c', 'https://c'), (4, 3, 'd', 'https://d')`,
	} {
		if _, err := s.db.Exec(stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	if err := s.migrate(); err != nil {
		t.Fatalf("migrate() failed: %v", err)
	}

	if got, want := groupIDs(t, s), []int64{1, 3, 7}; !reflect.DeepEqual(got, want) {
		t.Errorf("groups = %v, want %v", got, want)
	}
	if got, want := feedIDsIn(t, s, 3), []int64{2, 4, 9}; !reflect.DeepEqual(got, want) {
		t.Errorf("feeds in 3 = %v, want %v", got, want)
	}
	var pos int
	if err := s.db.QueryRow(`SELECT position FROM feeds WHERE id = 5`).Scan(&pos); err != nil || pos != 0 {
		t.Errorf("feed 5 position = %d (err %v), want 0", pos, err)
	}
}

func TestNewRowsLandLastAfterReorder(t *testing.T) {
	s, _ := setupTestDB(t)
	defer closeStore(t, s)

	g2 := mustCreateGroup(t, s, "g2")
	g3 := mustCreateGroup(t, s, "g3")
	if err := s.ReorderGroups([]int64{g3.ID, 1, g2.ID}); err != nil {
		t.Fatalf("ReorderGroups() failed: %v", err)
	}
	g4 := mustCreateGroup(t, s, "g4")
	if got, want := groupIDs(t, s), []int64{g3.ID, 1, g2.ID, g4.ID}; !reflect.DeepEqual(got, want) {
		t.Errorf("groups = %v, want %v", got, want)
	}

	a := mustCreateFeed(t, s, g2.ID, "a", "https://a", "", "")
	b := mustCreateFeed(t, s, g2.ID, "b", "https://b", "", "")
	if err := s.ReorderFeeds(g2.ID, []int64{b.ID, a.ID}); err != nil {
		t.Fatalf("ReorderFeeds() failed: %v", err)
	}
	c := mustCreateFeed(t, s, g2.ID, "c", "https://c", "", "")
	if got, want := feedIDsIn(t, s, g2.ID), []int64{b.ID, a.ID, c.ID}; !reflect.DeepEqual(got, want) {
		t.Errorf("feeds = %v, want %v", got, want)
	}
}

func TestMovedFeedLandsLastInNewGroup(t *testing.T) {
	s, _ := setupTestDB(t)
	defer closeStore(t, s)

	g2 := mustCreateGroup(t, s, "g2")
	a := mustCreateFeed(t, s, 1, "a", "https://a", "", "")
	b := mustCreateFeed(t, s, g2.ID, "b", "https://b", "", "")
	c := mustCreateFeed(t, s, g2.ID, "c", "https://c", "", "")
	if err := s.ReorderFeeds(g2.ID, []int64{c.ID, b.ID}); err != nil {
		t.Fatalf("ReorderFeeds() failed: %v", err)
	}

	if err := s.UpdateFeed(a.ID, UpdateFeedParams{GroupID: &g2.ID}); err != nil {
		t.Fatalf("UpdateFeed() failed: %v", err)
	}
	if got, want := feedIDsIn(t, s, g2.ID), []int64{c.ID, b.ID, a.ID}; !reflect.DeepEqual(got, want) {
		t.Errorf("feeds = %v, want %v", got, want)
	}

	// Renaming without changing the group must not move the feed.
	name := "renamed"
	if err := s.UpdateFeed(c.ID, UpdateFeedParams{Name: &name}); err != nil {
		t.Fatalf("UpdateFeed() failed: %v", err)
	}
	if got, want := feedIDsIn(t, s, g2.ID), []int64{c.ID, b.ID, a.ID}; !reflect.DeepEqual(got, want) {
		t.Errorf("feeds after rename = %v, want %v", got, want)
	}
}

func TestReorderRoundTripAndRejects(t *testing.T) {
	s, _ := setupTestDB(t)
	defer closeStore(t, s)

	g2 := mustCreateGroup(t, s, "g2")
	g3 := mustCreateGroup(t, s, "g3")
	a := mustCreateFeed(t, s, g2.ID, "a", "https://a", "", "")
	b := mustCreateFeed(t, s, g2.ID, "b", "https://b", "", "")
	other := mustCreateFeed(t, s, g3.ID, "o", "https://o", "", "")

	want := []int64{g3.ID, g2.ID, 1}
	if err := s.ReorderGroups(want); err != nil {
		t.Fatalf("ReorderGroups() failed: %v", err)
	}
	if got := groupIDs(t, s); !reflect.DeepEqual(got, want) {
		t.Errorf("groups = %v, want %v", got, want)
	}

	wantFeeds := []int64{b.ID, a.ID}
	if err := s.ReorderFeeds(g2.ID, wantFeeds); err != nil {
		t.Fatalf("ReorderFeeds() failed: %v", err)
	}
	if got := feedIDsIn(t, s, g2.ID); !reflect.DeepEqual(got, wantFeeds) {
		t.Errorf("feeds = %v, want %v", got, wantFeeds)
	}

	badGroups := [][]int64{{g3.ID, g2.ID}, {g3.ID, g2.ID, 1, 99}, {g3.ID, g3.ID, 1}}
	for _, ids := range badGroups {
		if err := s.ReorderGroups(ids); !errors.Is(err, ErrInvalid) {
			t.Errorf("ReorderGroups(%v) = %v, want ErrInvalid", ids, err)
		}
	}
	badFeeds := [][]int64{{a.ID}, {a.ID, b.ID, 99}, {a.ID, a.ID}, {a.ID, other.ID}}
	for _, ids := range badFeeds {
		if err := s.ReorderFeeds(g2.ID, ids); !errors.Is(err, ErrInvalid) {
			t.Errorf("ReorderFeeds(%v) = %v, want ErrInvalid", ids, err)
		}
	}
	if err := s.ReorderFeeds(999, nil); !errors.Is(err, ErrNotFound) {
		t.Errorf("ReorderFeeds(unknown group) = %v, want ErrNotFound", err)
	}

	if got := groupIDs(t, s); !reflect.DeepEqual(got, want) {
		t.Errorf("groups changed by rejected calls: %v", got)
	}
	if got := feedIDsIn(t, s, g2.ID); !reflect.DeepEqual(got, wantFeeds) {
		t.Errorf("feeds changed by rejected calls: %v", got)
	}
}
