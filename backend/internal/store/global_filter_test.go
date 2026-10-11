package store

import (
	"errors"
	"testing"

	"github.com/0x2E/fusion/internal/filter"
)

func removeGiveaways() filter.Rule {
	return filter.Rule{
		Action: filter.ActionRemove, Join: filter.JoinAnd,
		Conditions: []filter.Condition{{Trigger: filter.TriggerTitle, Operator: filter.OpContains, Value: "giveaway"}},
	}
}

type globalFixture struct {
	s                               *Store
	garden, cycling                 int64
	tomatoGiveaway, compostGiveaway int64
	tomatoStaking, compostBasics    int64
	bellGiveaway, gravelTyres       int64
}

// setupGlobalFixture makes a gardening and a cycling feed; giveaway titles are
// in both, so one global rule has to reach across feeds.
func setupGlobalFixture(t *testing.T) *globalFixture {
	t.Helper()
	s, _ := setupTestDB(t)
	t.Cleanup(func() { closeStore(t, s) })

	group := mustCreateGroup(t, s, "Hobbies")
	garden := mustCreateFeed(t, s, group.ID, "Garden notes", "https://gardennotes.example/feed", "https://gardennotes.example", "")
	cycling := mustCreateFeed(t, s, group.ID, "Spoke weekly", "https://spokeweekly.example/feed", "https://spokeweekly.example", "")
	item := func(feedID int64, guid, title string, pub int64) int64 {
		return mustCreateItem(t, s, feedID, guid, title, "https://example.test/"+guid, "<p>text</p>", pub).ID
	}
	return &globalFixture{
		s: s, garden: garden.ID, cycling: cycling.ID,
		tomatoGiveaway:  item(garden.ID, "a1", "Tomato seed giveaway", 600),
		compostGiveaway: item(garden.ID, "a2", "Compost bin giveaway", 500),
		tomatoStaking:   item(garden.ID, "a3", "Staking tomatoes", 400),
		compostBasics:   item(garden.ID, "a4", "Compost basics", 300),
		bellGiveaway:    item(cycling.ID, "b1", "Giveaway: a free bell", 200),
		gravelTyres:     item(cycling.ID, "b2", "Gravel tyres compared", 100),
	}
}

func (f *globalFixture) visible(t *testing.T, ids ...int64) {
	t.Helper()
	got := itemIDs(t, f.s, ListItemsParams{})
	want := map[int64]bool{}
	for _, id := range ids {
		want[id] = true
	}
	if len(got) != len(want) {
		t.Errorf("visible items = %v, want %v", got, want)
		return
	}
	for id := range want {
		if !got[id] {
			t.Errorf("visible items = %v, want %v", got, want)
			return
		}
	}
}

func (f *globalFixture) keepTomatoes(t *testing.T) {
	t.Helper()
	keep := filter.Rule{
		Action: filter.ActionKeep, Join: filter.JoinAnd,
		Conditions: []filter.Condition{{Trigger: filter.TriggerTitle, Operator: filter.OpContains, Value: "tomato"}},
	}
	if _, err := f.s.UpsertFeedFilter(f.garden, keep, true); err != nil {
		t.Fatal(err)
	}
}

func TestGlobalFilterHidesAcrossFeeds(t *testing.T) {
	f := setupGlobalFixture(t)

	saved, err := f.s.UpsertGlobalFilter(removeGiveaways(), true)
	if err != nil {
		t.Fatal(err)
	}
	if saved.HiddenTotal != 3 {
		t.Errorf("HiddenTotal = %d, want 3", saved.HiddenTotal)
	}
	f.visible(t, f.tomatoStaking, f.compostBasics, f.gravelTyres)
}

func TestGlobalAndFeedFilterHideWhenEitherHides(t *testing.T) {
	f := setupGlobalFixture(t)
	f.keepTomatoes(t) // hides both compost articles in the garden feed
	if _, err := f.s.UpsertGlobalFilter(removeGiveaways(), true); err != nil {
		t.Fatal(err)
	}

	// Tomato giveaway passes Keep but not the global Remove; compost basics
	// passes the global Remove but not Keep.
	f.visible(t, f.tomatoStaking, f.gravelTyres)
}

func TestGlobalOffUnhidesOnlyWhatGlobalAloneHid(t *testing.T) {
	f := setupGlobalFixture(t)
	f.keepTomatoes(t)
	if _, err := f.s.UpsertGlobalFilter(removeGiveaways(), true); err != nil {
		t.Fatal(err)
	}

	if _, err := f.s.SetGlobalFilterEnabled(false); err != nil {
		t.Fatal(err)
	}
	// The compost giveaway is still hidden by the garden Keep filter.
	f.visible(t, f.tomatoGiveaway, f.tomatoStaking, f.bellGiveaway, f.gravelTyres)

	if _, err := f.s.SetGlobalFilterEnabled(true); err != nil {
		t.Fatal(err)
	}
	f.visible(t, f.tomatoStaking, f.gravelTyres)

	if _, err := f.s.DeleteGlobalFilter(); err != nil {
		t.Fatal(err)
	}
	f.visible(t, f.tomatoGiveaway, f.tomatoStaking, f.bellGiveaway, f.gravelTyres)
}

func TestPullAppliesGlobalAndFeedFilter(t *testing.T) {
	f := setupGlobalFixture(t)
	f.keepTomatoes(t)
	if _, err := f.s.UpsertGlobalFilter(removeGiveaways(), true); err != nil {
		t.Fatal(err)
	}

	inputs := []BatchCreateItemInput{
		{GUID: "n1", Title: "Tomato blight tips", Link: "https://gardennotes.example/blight", PubDate: 700},
		{GUID: "n2", Title: "Tomato giveaway, round two", Link: "https://gardennotes.example/g2", PubDate: 701},
		{GUID: "n3", Title: "Pruning roses", Link: "https://gardennotes.example/roses", PubDate: 702},
	}
	if err := f.s.MarkFilteredInputs(f.garden, inputs); err != nil {
		t.Fatal(err)
	}
	want := []bool{false, true, true}
	for i, in := range inputs {
		if in.Filtered != want[i] {
			t.Errorf("%q filtered = %v, want %v", in.Title, in.Filtered, want[i])
		}
	}

	// A feed without its own filter still gets the global one.
	cyclingInputs := []BatchCreateItemInput{
		{GUID: "m1", Title: "Giveaway: free pump", Link: "https://spokeweekly.example/pump", PubDate: 703},
		{GUID: "m2", Title: "Chain wax review", Link: "https://spokeweekly.example/wax", PubDate: 704},
	}
	if err := f.s.MarkFilteredInputs(f.cycling, cyclingInputs); err != nil {
		t.Fatal(err)
	}
	if !cyclingInputs[0].Filtered || cyclingInputs[1].Filtered {
		t.Errorf("cycling filtered = %v, %v; want true, false", cyclingInputs[0].Filtered, cyclingInputs[1].Filtered)
	}
}

func TestUpsertGlobalFilterRejectsKeepAndBadRule(t *testing.T) {
	f := setupGlobalFixture(t)

	keep := removeGiveaways()
	keep.Action = filter.ActionKeep
	if _, err := f.s.UpsertGlobalFilter(keep, true); !errors.Is(err, ErrInvalid) {
		t.Errorf("UpsertGlobalFilter(keep) = %v, want ErrInvalid", err)
	}
	if _, err := f.s.PreviewGlobalFilter(keep); !errors.Is(err, ErrInvalid) {
		t.Errorf("PreviewGlobalFilter(keep) = %v, want ErrInvalid", err)
	}
	if _, err := f.s.GetGlobalFilter(); !errors.Is(err, ErrNotFound) {
		t.Errorf("GetGlobalFilter() = %v, want ErrNotFound", err)
	}
	if _, err := f.s.SetGlobalFilterEnabled(true); !errors.Is(err, ErrNotFound) {
		t.Errorf("SetGlobalFilterEnabled(no filter) = %v, want ErrNotFound", err)
	}
}

func TestPreviewFilterReportsGlobalHidden(t *testing.T) {
	f := setupGlobalFixture(t)
	if _, err := f.s.UpsertGlobalFilter(removeGiveaways(), true); err != nil {
		t.Fatal(err)
	}

	// The draft hides compost articles; the global filter hides the giveaways.
	draft := removeGiveaways()
	draft.Conditions[0].Value = "compost"
	preview, err := f.s.PreviewFilter(f.garden, draft)
	if err != nil {
		t.Fatal(err)
	}
	if preview.Checked != 4 || preview.Hidden != 2 || preview.GlobalHidden != 2 {
		t.Fatalf("preview = %d checked, %d hidden, %d global; want 4, 2, 2", preview.Checked, preview.Hidden, preview.GlobalHidden)
	}
	for _, it := range preview.Items {
		wantGlobal := it.ID == f.tomatoGiveaway || it.ID == f.compostGiveaway
		if it.GlobalHidden != wantGlobal {
			t.Errorf("item %d global_hidden = %v, want %v", it.ID, it.GlobalHidden, wantGlobal)
		}
	}

	// A switched-off global filter is not reported.
	if _, err := f.s.SetGlobalFilterEnabled(false); err != nil {
		t.Fatal(err)
	}
	preview, err = f.s.PreviewFilter(f.garden, draft)
	if err != nil || preview.GlobalHidden != 0 {
		t.Errorf("preview with global off = %+v, %v; want global_hidden 0", preview, err)
	}
}

func TestPreviewGlobalFilter(t *testing.T) {
	f := setupGlobalFixture(t)

	preview, err := f.s.PreviewGlobalFilter(removeGiveaways())
	if err != nil {
		t.Fatal(err)
	}
	if preview.Checked != 6 || preview.Hidden != 3 || len(preview.Items) != 6 {
		t.Fatalf("preview = %d checked, %d hidden, %d listed; want 6, 3, 6", preview.Checked, preview.Hidden, len(preview.Items))
	}
	last := preview.Items[5]
	if last.ID != f.gravelTyres || last.FeedName != "Spoke weekly" || last.Hidden {
		t.Errorf("last item = %+v", last)
	}
	// A preview saves nothing.
	f.visible(t, f.tomatoGiveaway, f.compostGiveaway, f.tomatoStaking, f.compostBasics, f.bellGiveaway, f.gravelTyres)
}
