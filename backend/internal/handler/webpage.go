package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/0x2E/fusion/internal/pkg/httpc"
	"github.com/0x2E/fusion/internal/pkg/webpage"
	"github.com/0x2E/fusion/internal/store"
	"github.com/gin-gonic/gin"
)

// newWebPageClient is a variable so tests can trust their TLS test server.
var newWebPageClient = httpc.NewClient

const webPageUnavailable = `<!doctype html><meta charset="utf-8"><title>Unavailable</title>` +
	`<body style="font-family:sans-serif;padding:2rem"><p>The web page could not be loaded.</p></body>`

// getItemPage is the iframe source for the web page view. Pages that allow
// framing are redirected to directly. Others are copied with framing headers
// dropped; the CSP sandbox gives the copy an opaque origin, so its scripts
// cannot use our session cookie against the API. A feed with custom CSS (or a
// ?css= preview draft) is always copied so the style can be injected.
func (h *Handler) getItemPage(c *gin.Context) {
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
	link := itemOpenLink(item, feed)

	if err := httpc.ValidateRequestURL(c.Request.Context(), link, allowPrivateFeeds); err != nil {
		badRequestError(c, "invalid item link")
		return
	}

	client, err := newWebPageClient(fullContentTimeout, feed.Proxy, allowPrivateFeeds)
	if err != nil {
		internalError(c, err, "create http client")
		return
	}

	css, hasCSS, ok := h.webPageCSS(c, item.FeedID)
	if !ok {
		return
	}
	fetch := webpage.Fetch
	if hasCSS {
		fetch = webpage.FetchCopy
	}

	page, err := fetch(c.Request.Context(), client, link)
	if err != nil {
		slog.Warn("web page fetch failed", "item_id", item.ID, "error", err)
		c.Header("X-Content-Type-Options", "nosniff")
		c.Data(http.StatusBadGateway, "text/html; charset=utf-8", []byte(webPageUnavailable))
		return
	}

	if page.Embeddable {
		c.Redirect(http.StatusFound, page.FinalURL.String())
		return
	}

	if strings.TrimSpace(css) != "" {
		page.Body = webpage.ApplyCSS(page.ContentType, page.Body, css)
	}

	c.Header("Content-Security-Policy", "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms; frame-ancestors 'self'")
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, page.ContentType, page.Body)
}

// webPageCSS picks the CSS for the copy: the ?css= draft when present (even
// empty, which forces a plain copy for previews), else the feed's stored CSS.
// hasCSS means the page must be served as a copy.
func (h *Handler) webPageCSS(c *gin.Context, feedID int64) (css string, hasCSS, ok bool) {
	if draft, present := c.GetQuery("css"); present {
		if len(draft) > store.MaxFeedWebCSSBytes {
			badRequestError(c, "css too large")
			return "", false, false
		}
		return draft, true, true
	}
	stored, err := h.store.GetFeedWebCSS(feedID)
	if errors.Is(err, store.ErrNotFound) {
		return "", false, true
	}
	if err != nil {
		internalError(c, err, "get feed css")
		return "", false, false
	}
	return stored.CSS, true, true
}
