package store

import "testing"

func searchCount(t *testing.T, store *Store, query string) int {
	t.Helper()
	results, err := store.SearchItems(query, 10)
	if err != nil {
		t.Fatalf("SearchItems(%q) failed: %v", query, err)
	}
	return len(results)
}

func TestSearchItemsIndexesVisibleTextOnly(t *testing.T) {
	store, _ := setupTestDB(t)
	defer closeStore(t, store)

	group := mustCreateGroup(t, store, "G")
	feed := mustCreateFeed(t, store, group.ID, "F", "https://example.com/f.xml", "https://example.com", "")
	mustCreateItem(t, store, feed.ID, "1", "One", "https://example.com/1",
		`<p>Lemur <a href="https://zoo.example">facts</a></p><script>var hidden = 1;</script>`, 100)
	mustCreateItem(t, store, feed.ID, "2", "Two", "https://example.com/2", "caf&eacute;", 99)
	mustCreateItem(t, store, feed.ID, "3", "Three", "https://example.com/3", "<p>alpha</p><p>beta</p>", 98)

	cases := []struct {
		query string
		want  int
	}{
		{"lemur", 1}, {"facts", 1},
		{"href", 0}, {"zoo", 0}, {"hidden", 0},
		{"café", 1},
		{"beta", 1}, {"alphabeta", 0},
	}
	for _, c := range cases {
		if got := searchCount(t, store, c.query); got != c.want {
			t.Errorf("SearchItems(%q) = %d results, want %d", c.query, got, c.want)
		}
	}
}
