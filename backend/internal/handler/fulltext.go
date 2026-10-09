package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/0x2E/fusion/internal/model"
	"github.com/0x2E/fusion/internal/pkg/fulltext"
	"github.com/0x2E/fusion/internal/pkg/httpc"
	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

const fullContentTimeout = 20 * time.Second

// getItemFullContent fetches the item's original page and returns the extracted
// article. Nothing is stored.
func (h *Handler) getItemFullContent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		badRequestError(c, "invalid id")
		return
	}

	item, err := h.store.GetItem(id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			notFoundError(c, "item")
			return
		}
		internalError(c, err, "get item")
		return
	}

	feed, err := h.store.GetFeed(item.FeedID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			notFoundError(c, "feed")
			return
		}
		internalError(c, err, "get feed")
		return
	}

	allowPrivateFeeds := h.config != nil && h.config.AllowPrivateFeeds

	if err := httpc.ValidateRequestURL(c.Request.Context(), item.Link, allowPrivateFeeds); err != nil {
		badRequestError(c, "invalid item link")
		return
	}

	client, err := httpc.NewClient(fullContentTimeout, feed.Proxy, allowPrivateFeeds)
	if err != nil {
		internalError(c, err, "create http client")
		return
	}

	article, err := fulltext.Fetch(c.Request.Context(), client, item.Link)
	if err != nil {
		slog.Warn("full content fetch failed", "item_id", item.ID, "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to fetch full content"})
		return
	}

	dataResponse(c, model.FullContent{Title: article.Title, Content: article.Content})
}
