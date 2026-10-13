package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

type feedWebCSSRequest struct {
	CSS string `json:"css"`
}

func (h *Handler) listFeedWebCSS(c *gin.Context) {
	list, err := h.store.ListFeedWebCSS()
	if err != nil {
		internalError(c, err, "list feed css")
		return
	}
	listResponse(c, list, len(list))
}

func (h *Handler) putFeedWebCSS(c *gin.Context) {
	feedID, ok := filterFeedID(c)
	if !ok {
		return
	}
	var req feedWebCSSRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequestError(c, "invalid request")
		return
	}

	// Empty or whitespace-only CSS means "no CSS": same as DELETE.
	if strings.TrimSpace(req.CSS) == "" {
		if err := h.store.DeleteFeedWebCSS(feedID); err != nil {
			internalError(c, err, "delete feed css")
			return
		}
		c.Status(http.StatusNoContent)
		return
	}

	saved, err := h.store.UpsertFeedWebCSS(feedID, req.CSS)
	if err != nil {
		feedWebCSSError(c, err, "save feed css")
		return
	}
	dataResponse(c, saved)
}

func (h *Handler) deleteFeedWebCSS(c *gin.Context) {
	feedID, ok := filterFeedID(c)
	if !ok {
		return
	}
	if err := h.store.DeleteFeedWebCSS(feedID); err != nil {
		internalError(c, err, "delete feed css")
		return
	}
	c.Status(http.StatusNoContent)
}

func feedWebCSSError(c *gin.Context, err error, context string) {
	switch {
	case errors.Is(err, store.ErrInvalid):
		badRequestError(c, err.Error())
	case errors.Is(err, store.ErrNotFound):
		notFoundError(c, "feed")
	default:
		internalError(c, err, context)
	}
}
