package handler

import (
	"net/url"
	"testing"
)

// The post feed link is the post path plus ".rss": no query, no fragment.
func TestRedditPostFeedDropsQueryAndFragment(t *testing.T) {
	const want = "https://www.reddit.com/r/golang/comments/abc123/some_title/.rss"
	for _, target := range []string{
		"https://www.reddit.com/r/golang/comments/abc123/some_title/",
		"https://www.reddit.com/r/golang/comments/abc123/some_title/?utm_source=share&utm_medium=web",
		"https://www.reddit.com/r/golang/comments/abc123/some_title/#comments",
	} {
		t.Run(target, func(t *testing.T) {
			u, err := url.Parse(target)
			if err != nil {
				t.Fatal(err)
			}
			feeds := redditFeeds(u)
			if len(feeds) != 1 || feeds[0].Link != want {
				t.Fatalf("feeds = %+v, want one link %q", feeds, want)
			}
		})
	}
}
