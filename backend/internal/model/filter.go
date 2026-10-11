package model

import "github.com/0x2E/fusion/internal/filter"

// FeedFilter is a feed's article filter with its stored state.
// HiddenCount is how many of the feed's stored articles it currently hides.
type FeedFilter struct {
	FeedID int64 `json:"feed_id"`
	filter.Rule
	Enabled     bool  `json:"enabled"`
	HiddenCount int64 `json:"hidden_count"`
	UpdatedAt   int64 `json:"updated_at"`
}

// FilterPreviewItem is one article in a filter preview.
type FilterPreviewItem struct {
	ID      int64  `json:"id"`
	Title   string `json:"title"`
	PubDate int64  `json:"pub_date"`
	Hidden  bool   `json:"hidden"`
}

// FilterPreview is the result of running a draft rule over a feed's stored
// articles: Checked of them were tested, Hidden would be hidden, and Items
// lists the latest ones.
type FilterPreview struct {
	Checked int                 `json:"checked"`
	Hidden  int                 `json:"hidden"`
	Items   []FilterPreviewItem `json:"items"`
}
