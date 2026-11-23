package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/0x2E/fusion/internal/model"
	"github.com/0x2E/fusion/internal/pull"
)

// directFeed fetches target once and reports it as a feed when it parses with
// a title or items. It lets validate skip feedfinder's slow path probing.
func (h *Handler) directFeed(ctx context.Context, client *http.Client, target string) (discoveredFeed, bool) {
	allowPrivateFeeds := false
	if h.config != nil {
		allowPrivateFeeds = h.config.AllowPrivateFeeds
		if h.config.PullTimeout > 0 {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, time.Duration(h.config.PullTimeout)*time.Second)
			defer cancel()
		}
	}

	res, err := pull.FetchAndParseWith(ctx, client, &model.Feed{Link: target}, allowPrivateFeeds)
	if err != nil || res == nil || res.NotModified {
		return discoveredFeed{}, false
	}
	if res.FeedTitle == "" && len(res.Items) == 0 {
		return discoveredFeed{}, false
	}
	return discoveredFeed{Title: res.FeedTitle, Link: target}, true
}
