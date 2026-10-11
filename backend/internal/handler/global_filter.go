package handler

import (
	"errors"
	"net/http"

	"github.com/0x2E/fusion/internal/filter"
	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

// getGlobalFilter answers {"data": null} when no global filter is set.
func (h *Handler) getGlobalFilter(c *gin.Context) {
	f, err := h.store.GetGlobalFilter()
	if errors.Is(err, store.ErrNotFound) {
		dataResponse(c, nil)
		return
	}
	if err != nil {
		internalError(c, err, "get global filter")
		return
	}
	dataResponse(c, f)
}

func (h *Handler) putGlobalFilter(c *gin.Context) {
	var req feedFilterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}
	enabled := req.Enabled == nil || *req.Enabled

	saved, err := h.store.UpsertGlobalFilter(req.Rule, enabled)
	if err != nil {
		globalFilterError(c, err, "save global filter")
		return
	}
	dataResponse(c, saved)
}

func (h *Handler) patchGlobalFilter(c *gin.Context) {
	var req feedFilterEnabledRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}

	saved, err := h.store.SetGlobalFilterEnabled(*req.Enabled)
	if err != nil {
		globalFilterError(c, err, "switch global filter")
		return
	}
	dataResponse(c, saved)
}

func (h *Handler) deleteGlobalFilter(c *gin.Context) {
	if _, err := h.store.DeleteGlobalFilter(); err != nil {
		globalFilterError(c, err, "delete global filter")
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) previewGlobalFilter(c *gin.Context) {
	var rule filter.Rule
	if err := c.ShouldBindJSON(&rule); err != nil {
		badRequestError(c, "invalid request")
		return
	}

	preview, err := h.store.PreviewGlobalFilter(rule)
	if err != nil {
		globalFilterError(c, err, "preview global filter")
		return
	}
	dataResponse(c, preview)
}

func globalFilterError(c *gin.Context, err error, context string) {
	switch {
	case errors.Is(err, store.ErrInvalid):
		badRequestError(c, err.Error())
	case errors.Is(err, store.ErrNotFound):
		notFoundError(c, "global filter")
	default:
		internalError(c, err, context)
	}
}
