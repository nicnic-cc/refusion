package handler

import (
	"errors"

	"github.com/0x2E/fusion/internal/filter"
	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

// filterGroupID parses the :id path parameter like filterFeedID.
var filterGroupID = filterFeedID

func (h *Handler) listGroupFilters(c *gin.Context) {
	filters, err := h.store.ListGroupFilters()
	if err != nil {
		internalError(c, err, "list group filters")
		return
	}
	listResponse(c, filters, len(filters))
}

func (h *Handler) putGroupFilter(c *gin.Context) {
	groupID, ok := filterGroupID(c)
	if !ok {
		return
	}
	var req feedFilterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}
	enabled := req.Enabled == nil || *req.Enabled

	saved, err := h.store.UpsertGroupFilter(groupID, req.Rule, enabled)
	if err != nil {
		groupFilterError(c, err, "save group filter")
		return
	}
	dataResponse(c, saved)
}

func (h *Handler) patchGroupFilter(c *gin.Context) {
	groupID, ok := filterGroupID(c)
	if !ok {
		return
	}
	var req feedFilterEnabledRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}

	saved, err := h.store.SetGroupFilterEnabled(groupID, *req.Enabled)
	if err != nil {
		groupFilterError(c, err, "switch group filter")
		return
	}
	dataResponse(c, saved)
}

// deleteGroupFilter answers {"data": {"hidden_total": n}}.
func (h *Handler) deleteGroupFilter(c *gin.Context) {
	groupID, ok := filterGroupID(c)
	if !ok {
		return
	}
	saved, err := h.store.DeleteGroupFilter(groupID)
	if err != nil {
		groupFilterError(c, err, "delete group filter")
		return
	}
	dataResponse(c, saved)
}

func (h *Handler) previewGroupFilter(c *gin.Context) {
	groupID, ok := filterGroupID(c)
	if !ok {
		return
	}
	var rule filter.Rule
	if err := c.ShouldBindJSON(&rule); err != nil {
		badRequestError(c, "invalid request")
		return
	}

	preview, err := h.store.PreviewGroupFilter(groupID, rule)
	if err != nil {
		groupFilterError(c, err, "preview group filter")
		return
	}
	dataResponse(c, preview)
}

func groupFilterError(c *gin.Context, err error, context string) {
	switch {
	case errors.Is(err, store.ErrInvalid):
		badRequestError(c, err.Error())
	case errors.Is(err, store.ErrNotFound):
		notFoundError(c, "group filter")
	default:
		internalError(c, err, context)
	}
}
