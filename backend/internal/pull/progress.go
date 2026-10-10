package pull

import (
	"context"
	"slices"
	"sync"
	"time"
)

// refreshBatchTimeout caps one RefreshFeeds batch, like the handler's refresh-all.
const refreshBatchTimeout = 30 * time.Minute

// progress tracks manual fetches for the UI. Pending is a count per feed
// because RefreshFeeds marks a feed while RefreshFeed marks it again.
// The zero value is ready to use.
type progress struct {
	mu       sync.Mutex
	pending  map[int64]int
	newItems int64
}

func (g *progress) mark(id int64) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.pending == nil {
		g.pending = make(map[int64]int)
	}
	g.pending[id]++
}

func (g *progress) unmark(id int64) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.pending[id] <= 1 {
		delete(g.pending, id)
		return
	}
	g.pending[id]--
}

// markIfIdle marks id unless it is already pending.
func (g *progress) markIfIdle(id int64) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.pending[id] > 0 {
		return false
	}
	if g.pending == nil {
		g.pending = make(map[int64]int)
	}
	g.pending[id] = 1
	return true
}

func (g *progress) addNewItems(n int) {
	g.mu.Lock()
	g.newItems += int64(n)
	g.mu.Unlock()
}

// PullStatus returns the sorted IDs of feeds with a manual fetch queued or
// running, and the running total of new items saved by any fetch.
func (p *Puller) PullStatus() ([]int64, int64) {
	g := &p.progress
	g.mu.Lock()
	defer g.mu.Unlock()
	ids := make([]int64, 0, len(g.pending))
	for id := range g.pending {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids, g.newItems
}

// RefreshFeeds queues a background fetch of the given feeds, skipping ones
// already pending, and returns how many it queued. Feeds are marked pending
// before it returns so a status request right after sees them.
func (p *Puller) RefreshFeeds(ids []int64) int {
	queued := make([]int64, 0, len(ids))
	for _, id := range ids {
		if p.progress.markIfIdle(id) {
			queued = append(queued, id)
		}
	}
	if len(queued) == 0 {
		return 0
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), refreshBatchTimeout)
		defer cancel()

		var wg sync.WaitGroup
		for _, id := range queued {
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer p.progress.unmark(id)
				if err := p.RefreshFeed(ctx, id); err != nil {
					p.logger.Warn("manual refresh failed", "feed_id", id, "error", err)
				}
			}()
		}
		wg.Wait()
		p.Wake()
	}()

	return len(queued)
}
