package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type markScopeReadRequest struct {
	MaxID   int64  `json:"max_id" binding:"required"`
	FeedID  *int64 `json:"feed_id"`
	GroupID *int64 `json:"group_id"`
}

// markScopeRead backs "mark all as read": it covers the whole feed, group or
// everything, not just the rows the client has loaded.
func (h *Handler) markScopeRead(c *gin.Context) {
	var req markScopeReadRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.MaxID <= 0 {
		badRequestError(c, "invalid request")
		return
	}
	if req.FeedID != nil && req.GroupID != nil {
		badRequestError(c, "feed_id and group_id are exclusive")
		return
	}

	if err := h.store.MarkScopeRead(req.MaxID, req.FeedID, req.GroupID); err != nil {
		internalError(c, err, "mark scope as read")
		return
	}

	c.Status(http.StatusNoContent)
}
