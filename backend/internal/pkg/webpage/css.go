package webpage

import (
	"bytes"
	"context"
	"fmt"
	"mime"
	"net/http"
	"regexp"
	"strings"
)

// FetchCopy is Fetch without the embed shortcut: the body is always read, so
// the caller can change it (custom CSS needs a copy to inject into).
func FetchCopy(ctx context.Context, client *http.Client, pageURL string) (Page, error) {
	return fetch(ctx, client, pageURL, true)
}

var (
	bodyClose = regexp.MustCompile(`(?i)</body\s*>`)
	htmlClose = regexp.MustCompile(`(?i)</html\s*>`)
	// Quoted attribute values may contain ">", so the tag match skips over them.
	metaTag = regexp.MustCompile(`(?i)<meta(?:\s(?:"[^"]*"|'[^']*'|[^'">])*)?/?>`)
	metaCSP = regexp.MustCompile(`(?i)[\s"'/]http-equiv\s*=\s*(?:"\s*content-security-policy\s*"|'\s*content-security-policy\s*'|content-security-policy(?:[\s/>]|$))`)
)

// InjectStyle adds css as a <style> block before the last </body>, else before
// the last </html>, else at the end. The css goes through escapeCSS so it
// cannot close the style element or break XHTML or the page charset.
func InjectStyle(doc []byte, css string) []byte {
	tag := []byte("<style>" + escapeCSS(css) + "</style>")

	at := len(doc)
	if loc := lastMatch(bodyClose, doc); loc != nil {
		at = loc[0]
	} else if loc := lastMatch(htmlClose, doc); loc != nil {
		at = loc[0]
	}

	out := make([]byte, 0, len(doc)+len(tag))
	out = append(out, doc[:at]...)
	out = append(out, tag...)
	return append(out, doc[at:]...)
}

// escapeCSS turns '&', '<' and non-ASCII runes into CSS hex escapes: same
// meaning in CSS, but valid XML and safe in any page charset.
func escapeCSS(css string) string {
	var b strings.Builder
	for _, r := range css {
		if r == '&' || r == '<' || r >= 0x80 {
			fmt.Fprintf(&b, `\%x `, r)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func lastMatch(re *regexp.Regexp, doc []byte) []int {
	all := re.FindAllIndex(doc, -1)
	if len(all) == 0 {
		return nil
	}
	return all[len(all)-1]
}

// StripMetaCSP removes <meta http-equiv="Content-Security-Policy"> tags, which
// would otherwise block the injected inline style. Report-Only does not enforce and stays.
func StripMetaCSP(doc []byte) []byte {
	return metaTag.ReplaceAllFunc(doc, func(tag []byte) []byte {
		if metaCSP.Match(tag) {
			return nil
		}
		return tag
	})
}

// ApplyCSS strips meta CSP and injects css into an HTML copy; other content
// types pass through unchanged.
func ApplyCSS(contentType string, body []byte, css string) []byte {
	mediaType, _, _ := mime.ParseMediaType(contentType)
	if mediaType != "text/html" && mediaType != "application/xhtml+xml" {
		return body
	}
	return InjectStyle(StripMetaCSP(bytes.Clone(body)), css)
}
