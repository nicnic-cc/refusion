// Package webpage fetches an article's original page and decides how the
// reader can show it inside an iframe.
package webpage

import (
	"context"
	"fmt"
	"html"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/0x2E/fusion/internal/pkg/httpc"
)

// maxPageBytes bounds memory per request; larger pages are cut off, not rejected.
const maxPageBytes = 5 << 20

// Page is a fetched page. Body is nil when Embeddable, since the frame can
// load FinalURL directly.
type Page struct {
	FinalURL    *url.URL
	Embeddable  bool
	ContentType string
	Body        []byte
}

// Fetch downloads pageURL with client. Non-2xx responses are errors.
func Fetch(ctx context.Context, client *http.Client, pageURL string) (Page, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return Page{}, err
	}
	httpc.SetDefaultHeaders(req)

	resp, err := client.Do(req)
	if err != nil {
		return Page{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return Page{}, fmt.Errorf("page fetch failed: status %d", resp.StatusCode)
	}

	page := Page{FinalURL: resp.Request.URL}
	// Plain http inside our https app would be mixed content, so it is copied instead.
	if page.FinalURL.Scheme == "https" && Frameable(resp.Header) {
		page.Embeddable = true
		return page, nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxPageBytes))
	if err != nil {
		return Page{}, err
	}
	page.Body = InjectBase(body, page.FinalURL.String())
	page.ContentType = htmlContentType(resp.Header.Get("Content-Type"))
	return page, nil
}

// Frameable reports whether the response lets any site frame it. Any
// X-Frame-Options value and any frame-ancestors other than a lone "*" count
// as blocked; Report-Only policies do not enforce, so they are ignored.
func Frameable(h http.Header) bool {
	if len(h.Values("X-Frame-Options")) > 0 {
		return false
	}
	for _, value := range h.Values("Content-Security-Policy") {
		for _, policy := range strings.Split(value, ",") {
			for _, directive := range strings.Split(policy, ";") {
				fields := strings.Fields(directive)
				if len(fields) == 0 || !strings.EqualFold(fields[0], "frame-ancestors") {
					continue
				}
				if len(fields) != 2 || fields[1] != "*" {
					return false
				}
			}
		}
	}
	return true
}

var (
	headTag = regexp.MustCompile(`(?i)<head(?:\s[^>]*)?>`)
	htmlTag = regexp.MustCompile(`(?i)<html(?:\s[^>]*)?>`)
)

// InjectBase puts a <base> tag first in the document so relative URLs resolve
// against the original site and links open in a new tab.
func InjectBase(doc []byte, baseURL string) []byte {
	tag := `<base href="` + html.EscapeString(baseURL) + `" target="_blank">`

	loc := headTag.FindIndex(doc)
	if loc == nil {
		loc = htmlTag.FindIndex(doc)
	}
	at := 0
	if loc != nil {
		at = loc[1]
	}

	out := make([]byte, 0, len(doc)+len(tag))
	out = append(out, doc[:at]...)
	out = append(out, tag...)
	return append(out, doc[at:]...)
}

// htmlContentType keeps upstream's header when it is HTML, to preserve the charset.
func htmlContentType(upstream string) string {
	if mediaType, _, err := mime.ParseMediaType(upstream); err == nil && mediaType == "text/html" {
		return upstream
	}
	return "text/html; charset=utf-8"
}
