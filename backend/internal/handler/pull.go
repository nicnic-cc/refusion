package handler

import (
	"errors"
	"io"
	"net/http"

	"github.com/0x2E/fusion/internal/model"
	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

// pullTracker is the part of the puller that reports and starts tracked
// fetches. It is asserted at call time so New's puller interface stays small.
type pullTracker interface {
	PullStatus() ([]int64, int64)
	RefreshFeeds(ids []int64) int
}

type startPullRequest struct {
	FeedID  *int64 `json:"feed_id"`
	GroupID *int64 `json:"group_id"`
}

type pullStatusResponse struct {
	Pending  []int64 `json:"pending"`
	NewItems int64   `json:"new_items"`
}

func (h *Handler) pullStatus(c *gin.Context) {
	tracker, ok := h.puller.(pullTracker)
	if !ok {
		internalError(c, errors.New("puller cannot report status"), "pull status")
		return
	}

	pending, newItems := tracker.PullStatus()
	dataResponse(c, pullStatusResponse{Pending: pending, NewItems: newItems})
}

// startPull queues a tracked fetch of one feed, one group, or all feeds.
func (h *Handler) startPull(c *gin.Context) {
	tracker, ok := h.puller.(pullTracker)
	if !ok {
		internalError(c, errors.New("puller cannot start tracked fetches"), "start pull")
		return
	}

	var req startPullRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		badRequestError(c, "invalid request")
		return
	}
	if req.FeedID != nil && req.GroupID != nil {
		badRequestError(c, "feed_id and group_id are mutually exclusive")
		return
	}

	var feeds []*model.Feed
	switch {
	case req.FeedID != nil:
		feed, err := h.store.GetFeed(*req.FeedID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				notFoundError(c, "feed")
				return
			}
			internalError(c, err, "get feed for pull")
			return
		}
		feeds = []*model.Feed{feed}
	default:
		if req.GroupID != nil {
			if _, err := h.store.GetGroup(*req.GroupID); err != nil {
				if errors.Is(err, store.ErrNotFound) {
					notFoundError(c, "group")
					return
				}
				internalError(c, err, "get group for pull")
				return
			}
		}
		all, err := h.store.ListFeeds()
		if err != nil {
			internalError(c, err, "list feeds for pull")
			return
		}
		for _, feed := range all {
			if req.GroupID == nil || feed.GroupID == *req.GroupID {
				feeds = append(feeds, feed)
			}
		}
	}

	ids := make([]int64, 0, len(feeds))
	for _, feed := range feeds {
		if !feed.Suspended {
			ids = append(ids, feed.ID)
		}
	}

	c.JSON(http.StatusAccepted, gin.H{"data": gin.H{"queued": tracker.RefreshFeeds(ids)}})
}
