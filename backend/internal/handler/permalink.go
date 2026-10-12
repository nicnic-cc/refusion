package handler

import "github.com/0x2E/fusion/internal/model"

// itemOpenLink is the URL to open for an item: its permalink when the feed
// opts in and the item has one, else the main link.
func itemOpenLink(item *model.Item, feed *model.Feed) string {
	if feed.OpenPermalink && item.Permalink != nil && *item.Permalink != "" {
		return *item.Permalink
	}
	return item.Link
}
