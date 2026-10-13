package store

import (
	"fmt"
	"sync"
	"testing"
)

// Many feeds' first pulls land at once (an OPML import); every batch must be stored.
func TestBatchCreateItemsIgnoreConcurrentFeeds(t *testing.T) {
	store, _ := setupTestDB(t)
	defer closeStore(t, store)

	const feeds, itemsPerFeed = 30, 40
	group := mustCreateGroup(t, store, "Birds")
	feedIDs := make([]int64, feeds)
	for i := range feedIDs {
		link := fmt.Sprintf("https://birds.example/%d.xml", i)
		feedIDs[i] = mustCreateFeed(t, store, group.ID, link, link, "", "").ID
	}

	start := make(chan struct{})
	errs := make(chan error, feeds)
	var wg sync.WaitGroup
	for _, feedID := range feedIDs {
		wg.Go(func() {
			inputs := make([]BatchCreateItemInput, itemsPerFeed)
			for j := range inputs {
				inputs[j] = BatchCreateItemInput{
					GUID:    fmt.Sprintf("heron-%d", j),
					Title:   fmt.Sprintf("Heron sighting %d", j),
					Content: "<p>Grey heron at the pond</p>",
					PubDate: int64(j),
				}
			}
			<-start
			// A pull reads the feed's filter before inserting, on its own connection.
			if err := store.MarkFilteredInputs(feedID, inputs); err != nil {
				errs <- fmt.Errorf("feed %d filter: %w", feedID, err)
				return
			}
			if _, err := store.BatchCreateItemsIgnore(feedID, inputs); err != nil {
				errs <- fmt.Errorf("feed %d insert: %w", feedID, err)
			}
		})
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}

	var stored int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM items`).Scan(&stored); err != nil {
		t.Fatalf("count items: %v", err)
	}
	if want := feeds * itemsPerFeed; stored != want {
		t.Errorf("stored %d items, want %d", stored, want)
	}
}
