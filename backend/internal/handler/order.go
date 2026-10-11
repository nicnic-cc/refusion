package handler

import (
	"errors"
	"net/http"

	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

type reorderGroupsRequest struct {
	IDs []int64 `json:"ids" binding:"required"`
}

type reorderFeedsRequest struct {
	GroupID int64   `json:"group_id" binding:"required"`
	IDs     []int64 `json:"ids" binding:"required"`
}

func (h *Handler) reorderGroups(c *gin.Context) {
	var req reorderGroupsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}

	if err := h.store.ReorderGroups(req.IDs); err != nil {
		reorderError(c, err, "reorder groups")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) reorderFeeds(c *gin.Context) {
	var req reorderFeedsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}

	if err := h.store.ReorderFeeds(req.GroupID, req.IDs); err != nil {
		reorderError(c, err, "reorder feeds")
		return
	}
	c.Status(http.StatusNoContent)
}

func reorderError(c *gin.Context, err error, context string) {
	switch {
	case errors.Is(err, store.ErrInvalid):
		badRequestError(c, err.Error())
	case errors.Is(err, store.ErrNotFound):
		notFoundError(c, "group")
	default:
		internalError(c, err, context)
	}
}
