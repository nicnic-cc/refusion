package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/0x2E/fusion/internal/filter"
	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

type feedFilterRequest struct {
	filter.Rule
	Enabled *bool `json:"enabled"` // defaults to on
}

type feedFilterEnabledRequest struct {
	Enabled *bool `json:"enabled" binding:"required"`
}

func (h *Handler) listFeedFilters(c *gin.Context) {
	filters, err := h.store.ListFeedFilters()
	if err != nil {
		internalError(c, err, "list feed filters")
		return
	}
	listResponse(c, filters, len(filters))
}

func (h *Handler) putFeedFilter(c *gin.Context) {
	feedID, ok := filterFeedID(c)
	if !ok {
		return
	}
	var req feedFilterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}
	enabled := req.Enabled == nil || *req.Enabled

	saved, err := h.store.UpsertFeedFilter(feedID, req.Rule, enabled)
	if err != nil {
		filterError(c, err, "save feed filter")
		return
	}
	dataResponse(c, saved)
}

func (h *Handler) patchFeedFilter(c *gin.Context) {
	feedID, ok := filterFeedID(c)
	if !ok {
		return
	}
	var req feedFilterEnabledRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}

	saved, err := h.store.SetFeedFilterEnabled(feedID, *req.Enabled)
	if err != nil {
		filterError(c, err, "switch feed filter")
		return
	}
	dataResponse(c, saved)
}

func (h *Handler) deleteFeedFilter(c *gin.Context) {
	feedID, ok := filterFeedID(c)
	if !ok {
		return
	}
	if err := h.store.DeleteFeedFilter(feedID); err != nil {
		filterError(c, err, "delete feed filter")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) previewFeedFilter(c *gin.Context) {
	feedID, ok := filterFeedID(c)
	if !ok {
		return
	}
	var rule filter.Rule
	if err := c.ShouldBindJSON(&rule); err != nil {
		badRequestError(c, "invalid request")
		return
	}

	preview, err := h.store.PreviewFilter(feedID, rule)
	if err != nil {
		filterError(c, err, "preview feed filter")
		return
	}
	dataResponse(c, preview)
}

func filterFeedID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		badRequestError(c, "invalid id")
		return 0, false
	}
	return id, true
}

func filterError(c *gin.Context, err error, context string) {
	switch {
	case errors.Is(err, store.ErrInvalid):
		badRequestError(c, err.Error())
	case errors.Is(err, store.ErrNotFound):
		notFoundError(c, "feed filter")
	default:
		internalError(c, err, context)
	}
}
