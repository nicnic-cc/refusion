package handler

import (
	"errors"
	"io"
	"net/http"
	"strconv"

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
	Pending    []int64 `json:"pending"`
	NewItems   int64   `json:"new_items"`
	LastItemID int64   `json:"last_item_id"`
}

func (h *Handler) pullStatus(c *gin.Context) {
	tracker, ok := h.puller.(pullTracker)
	if !ok {
		internalError(c, errors.New("puller cannot report status"), "pull status")
		return
	}

	// Read the max id first: an item saved in between is then counted as new
	// by the next poll instead of being missed.
	lastItemID, err := h.store.MaxItemID()
	if err != nil {
		internalError(c, err, "max item id")
		return
	}

	pending, newItems := tracker.PullStatus()
	dataResponse(c, pullStatusResponse{Pending: pending, NewItems: newItems, LastItemID: lastItemID})
}

// pullNewCount counts items saved after after_id within the list's feed or group.
func (h *Handler) pullNewCount(c *gin.Context) {
	afterID, err := strconv.ParseInt(c.Query("after_id"), 10, 64)
	if err != nil || afterID < 0 {
		badRequestError(c, "invalid after_id")
		return
	}

	var feedID, groupID *int64
	if raw := c.Query("feed_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			badRequestError(c, "invalid feed_id")
			return
		}
		feedID = &id
	}
	if raw := c.Query("group_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			badRequestError(c, "invalid group_id")
			return
		}
		groupID = &id
	}

	count, err := h.store.CountItemsAfter(afterID, feedID, groupID)
	if err != nil {
		internalError(c, err, "count new items")
		return
	}
	dataResponse(c, gin.H{"count": count})
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
