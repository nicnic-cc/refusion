package store

import (
	"testing"

	"github.com/0x2E/fusion/internal/model"
)

func (f *globalFixture) wantCounts(t *testing.T, want map[int64]model.HiddenCounts) {
	t.Helper()
	got, err := f.s.HiddenCounts()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want) {
		t.Fatalf("HiddenCounts() = %v, want %v", got, want)
	}
	for feedID, c := range want {
		if got[feedID] != c {
			t.Fatalf("HiddenCounts() = %v, want %v", got, want)
		}
	}
}

func TestHiddenCountsSplitFeedAndGlobal(t *testing.T) {
	f := setupGlobalFixture(t)
	f.keepTomatoes(t) // hides both compost articles in the garden feed
	if _, err := f.s.UpsertGlobalFilter(removeGiveaways(), true); err != nil {
		t.Fatal(err)
	}

	// The compost giveaway is hidden by both filters and counts once, under
	// the feed; the tomato and bell giveaways are the global filter's alone.
	f.wantCounts(t, map[int64]model.HiddenCounts{
		f.garden:  {Feed: 2, Global: 1},
		f.cycling: {Global: 1},
	})

	if _, err := f.s.SetGlobalFilterEnabled(false); err != nil {
		t.Fatal(err)
	}
	f.wantCounts(t, map[int64]model.HiddenCounts{f.garden: {Feed: 2}})

	if _, err := f.s.SetGlobalFilterEnabled(true); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.DeleteGlobalFilter(); err != nil {
		t.Fatal(err)
	}
	f.wantCounts(t, map[int64]model.HiddenCounts{f.garden: {Feed: 2}})

	// Taking the feed filter away leaves nothing hidden.
	if err := f.s.DeleteFeedFilter(f.garden); err != nil {
		t.Fatal(err)
	}
	f.wantCounts(t, map[int64]model.HiddenCounts{})
}

func TestFilteredGlobalOnPullAndInItemList(t *testing.T) {
	f := setupGlobalFixture(t)
	f.keepTomatoes(t)
	if _, err := f.s.UpsertGlobalFilter(removeGiveaways(), true); err != nil {
		t.Fatal(err)
	}

	inputs := []BatchCreateItemInput{
		{GUID: "n1", Title: "Tomato giveaway, round two", Link: "https://gardennotes.example/g2", PubDate: 701},
		{GUID: "n2", Title: "Pruning roses", Link: "https://gardennotes.example/roses", PubDate: 702},
	}
	if err := f.s.MarkFilteredInputs(f.garden, inputs); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.BatchCreateItemsIgnore(f.garden, inputs); err != nil {
		t.Fatal(err)
	}
	// "Tomato giveaway" passes Keep, so only the global filter hides it;
	// "Pruning roses" fails Keep, so the feed filter hides it.
	f.wantCounts(t, map[int64]model.HiddenCounts{
		f.garden:  {Feed: 3, Global: 2},
		f.cycling: {Global: 1},
	})

	items, err := f.s.ListItems(ListItemsParams{FeedID: &f.garden, IncludeFiltered: true})
	if err != nil {
		t.Fatal(err)
	}
	global := map[int64]bool{}
	for _, it := range items {
		if it.FilteredGlobal {
			global[it.ID] = true
		}
		if it.FilteredGlobal && !it.Filtered {
			t.Errorf("item %d is filtered_global but not filtered", it.ID)
		}
	}
	if len(global) != 2 || !global[f.tomatoGiveaway] {
		t.Errorf("filtered_global items = %v, want the two global-only giveaways", global)
	}
}
