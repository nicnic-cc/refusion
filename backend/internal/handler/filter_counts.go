package handler

import "github.com/gin-gonic/gin"

// getHiddenCounts answers {feed_id: {feed, global}} for feeds hiding articles.
func (h *Handler) getHiddenCounts(c *gin.Context) {
	counts, err := h.store.HiddenCounts()
	if err != nil {
		internalError(c, err, "get hidden counts")
		return
	}
	dataResponse(c, counts)
}
