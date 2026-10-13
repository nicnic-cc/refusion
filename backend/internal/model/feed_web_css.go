package model

// FeedWebCSS is the custom CSS a feed applies to its articles in the web page view.
type FeedWebCSS struct {
	FeedID    int64  `json:"feed_id"`
	CSS       string `json:"css"`
	UpdatedAt int64  `json:"updated_at"`
}
