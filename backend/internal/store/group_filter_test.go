package store

import (
	"testing"

	"github.com/0x2E/fusion/internal/filter"
	"github.com/0x2E/fusion/internal/model"
)

func titleRule(action, value string) filter.Rule {
	return filter.Rule{
		Action: action, Join: filter.JoinAnd,
		Conditions: []filter.Condition{{Trigger: filter.TriggerTitle, Operator: filter.OpContains, Value: value}},
	}
}

// wantFlags checks filtered, filtered_group and filtered_global as the item
// JSON reports them.
func wantFlags(t *testing.T, s *Store, name string, id int64, filtered, group, global bool) {
	t.Helper()
	it, err := s.GetItem(id)
	if err != nil {
		t.Fatal(err)
	}
	if it.Filtered != filtered || it.FilteredGroup != group || it.FilteredGlobal != global {
		t.Errorf("%s: filtered/group/global = %v/%v/%v, want %v/%v/%v",
			name, it.Filtered, it.FilteredGroup, it.FilteredGlobal, filtered, group, global)
	}
}

// TestGroupFilterWithGlobalAndFeed runs all three filters together. The
// folder Keep rule reads content text while the other two read titles only,
// so it breaks if the folder matcher is left out when building the article.
func TestGroupFilterWithGlobalAndFeed(t *testing.T) {
	s, _ := setupTestDB(t)
	t.Cleanup(func() { closeStore(t, s) })

	hobbies := mustCreateGroup(t, s, "Hobbies")
	kitchen := mustCreateGroup(t, s, "Kitchen")
	garden := mustCreateFeed(t, s, hobbies.ID, "Garden notes", "https://gardennotes.example/feed", "", "").ID
	cycling := mustCreateFeed(t, s, hobbies.ID, "Spoke weekly", "https://spokeweekly.example/feed", "", "").ID
	item := func(feedID int64, guid, title, body string) int64 {
		return mustCreateItem(t, s, feedID, guid, title, "https://example.test/"+guid, "<p>"+body+"</p>", 100).ID
	}
	seedGiveaway := item(garden, "g1", "Seed giveaway", "spring sowing")
	pestSpring := item(garden, "g2", "Pest control", "spring aphids")
	pestAutumn := item(garden, "g3", "Pest guide", "autumn slugs")
	mulch := item(garden, "g4", "Mulch", "winter cover")
	planting := item(garden, "g5", "Planting", "spring beds")
	toolGiveaway := item(garden, "g6", "Tool giveaway", "winter shed")
	rides := item(cycling, "c1", "Rides", "spring loops")
	tyres := item(cycling, "c2", "Tyres", "winter grip")

	if _, err := s.UpsertGlobalFilter(titleRule(filter.ActionRemove, "giveaway"), true); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpsertFeedFilter(garden, titleRule(filter.ActionRemove, "pest"), true); err != nil {
		t.Fatal(err)
	}
	keepSpring := filter.Rule{
		Action: filter.ActionKeep, Join: filter.JoinAnd,
		Conditions: []filter.Condition{{Trigger: filter.TriggerContent, Operator: filter.OpContains, Value: "spring"}},
	}
	saved, err := s.UpsertGroupFilter(hobbies.ID, keepSpring, true)
	if err != nil {
		t.Fatal(err)
	}
	if saved.HiddenTotal != 6 {
		t.Errorf("HiddenTotal = %d, want 6", saved.HiddenTotal)
	}

	// Blame goes to the most specific filter that hides the article.
	wantFlags(t, s, "seed giveaway", seedGiveaway, true, false, true)
	wantFlags(t, s, "pest spring", pestSpring, true, false, false)
	wantFlags(t, s, "pest autumn", pestAutumn, true, false, false)
	wantFlags(t, s, "mulch", mulch, true, true, false)
	wantFlags(t, s, "planting", planting, false, false, false)
	wantFlags(t, s, "tool giveaway", toolGiveaway, true, true, false)
	wantFlags(t, s, "rides", rides, false, false, false)
	wantFlags(t, s, "tyres", tyres, true, true, false)

	counts, err := s.HiddenCounts()
	if err != nil {
		t.Fatal(err)
	}
	if got, want := counts[garden], (model.HiddenCounts{Feed: 2, Group: 2, Global: 1}); got != want {
		t.Errorf("garden counts = %+v, want %+v", got, want)
	}
	if got, want := counts[cycling], (model.HiddenCounts{Group: 1}); got != want {
		t.Errorf("cycling counts = %+v, want %+v", got, want)
	}

	// A pulled article goes through the same three filters.
	inputs := []BatchCreateItemInput{{GUID: "c3", Title: "Chains", Link: "https://example.test/c3", Content: "<p>winter wax</p>"}}
	if err := s.MarkFilteredInputs(cycling, inputs); err != nil {
		t.Fatal(err)
	}
	if in := inputs[0]; !in.Filtered || !in.FilteredGroup || in.FilteredGlobal {
		t.Errorf("pulled article filtered/group/global = %v/%v/%v, want true/true/false", in.Filtered, in.FilteredGroup, in.FilteredGlobal)
	}

	// Moving the garden feed to a folder without a filter drops the folder's verdict.
	if err := s.UpdateFeed(garden, UpdateFeedParams{GroupID: &kitchen.ID}); err != nil {
		t.Fatal(err)
	}
	wantFlags(t, s, "moved seed giveaway", seedGiveaway, true, false, true)
	wantFlags(t, s, "moved pest autumn", pestAutumn, true, false, false)
	wantFlags(t, s, "moved mulch", mulch, false, false, false)
	wantFlags(t, s, "moved tool giveaway", toolGiveaway, true, false, true)

	// Deleting a folder that still has feeds moves them under Default's filter.
	if _, err := s.UpsertGroupFilter(1, titleRule(filter.ActionRemove, "rides"), true); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteGroup(hobbies.ID); err != nil {
		t.Fatal(err)
	}
	wantFlags(t, s, "rides in Default", rides, true, true, false)
	wantFlags(t, s, "tyres in Default", tyres, false, false, false)
}
