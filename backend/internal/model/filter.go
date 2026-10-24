package model

import "github.com/0x2E/fusion/internal/filter"

// FeedFilter is a feed's article filter with its stored state.
type FeedFilter struct {
	FeedID int64 `json:"feed_id"`
	filter.Rule
	Enabled   bool  `json:"enabled"`
	UpdatedAt int64 `json:"updated_at"`
}

// HiddenCounts splits a feed's hidden articles: Feed by its own filter, Group
// by its folder's filter and not its own, Global by the global filter alone.
// Together they are everything hidden in the feed.
type HiddenCounts struct {
	Feed   int64 `json:"feed"`
	Group  int64 `json:"group"`
	Global int64 `json:"global"`
}

// FilterPreviewItem is one article in a filter preview.
// GlobalHidden marks articles the saved global filter already hides.
type FilterPreviewItem struct {
	ID           int64  `json:"id"`
	Title        string `json:"title"`
	PubDate      int64  `json:"pub_date"`
	Hidden       bool   `json:"hidden"`
	GlobalHidden bool   `json:"global_hidden"`
}

// FilterPreview is the result of running a draft rule over a feed's stored
// articles: Checked of them were tested, Hidden would be hidden, and Items
// lists the latest ones. GlobalHidden counts the articles the saved global
// filter hides, apart from the draft rule's own Hidden.
type FilterPreview struct {
	Checked      int                 `json:"checked"`
	Hidden       int                 `json:"hidden"`
	GlobalHidden int                 `json:"global_hidden"`
	Items        []FilterPreviewItem `json:"items"`
}

// GlobalFilter is the one filter that hides articles in every feed (Remove
// only). It has no hidden count: that would need re-running the matcher.
type GlobalFilter struct {
	filter.Rule
	Enabled   bool  `json:"enabled"`
	UpdatedAt int64 `json:"updated_at"`
}

// GlobalFilterSaved is the answer to saving, switching or deleting the global
// filter. HiddenTotal is every article now hidden by any filter.
type GlobalFilterSaved struct {
	*GlobalFilter
	HiddenTotal int64 `json:"hidden_total"`
}

// GlobalPreviewItem is one article in a global filter preview.
type GlobalPreviewItem struct {
	ID       int64  `json:"id"`
	FeedID   int64  `json:"feed_id"`
	FeedName string `json:"feed_name"`
	Title    string `json:"title"`
	PubDate  int64  `json:"pub_date"`
	Hidden   bool   `json:"hidden"`
}

// GlobalPreview runs a draft global rule over the latest articles of all
// feeds only: Checked is capped, so Hidden is a sample, not the total.
type GlobalPreview struct {
	Checked int                 `json:"checked"`
	Hidden  int                 `json:"hidden"`
	Items   []GlobalPreviewItem `json:"items"`
}

// GroupFilter is a folder's article filter: it hides articles in every feed
// of the folder.
type GroupFilter struct {
	GroupID int64 `json:"group_id"`
	filter.Rule
	Enabled   bool  `json:"enabled"`
	UpdatedAt int64 `json:"updated_at"`
}

// GroupFilterSaved is the answer to saving, switching or deleting a folder
// filter. HiddenTotal is every article now hidden by any filter in the
// folder's feeds. GroupFilter is nil after a delete.
type GroupFilterSaved struct {
	*GroupFilter
	HiddenTotal int64 `json:"hidden_total"`
}
