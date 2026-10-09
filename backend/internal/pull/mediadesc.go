package pull

import (
	"html"
	"regexp"
	"strings"

	"github.com/mmcdole/gofeed"
)

var mediaURLRe = regexp.MustCompile(`https?://[^\s<>"]+`)

// mediaDescription returns media:description (plain text, e.g. YouTube Atom
// entries) as HTML with http(s) URLs linked. Lines end in "<br>\n": the list
// snippet strips tags, and the newline keeps lines from running together.
func mediaDescription(item *gofeed.Item) string {
	text := firstMediaDescription(item)
	if text == "" {
		return ""
	}
	text = strings.ReplaceAll(text, "\r\n", "\n")
	return strings.ReplaceAll(linkifyEscaped(text), "\n", "<br>\n")
}

// linkifyEscaped escapes per piece: linkifying already-escaped text would
// double-escape the & in query strings.
func linkifyEscaped(text string) string {
	var b strings.Builder
	last := 0
	for _, loc := range mediaURLRe.FindAllStringIndex(text, -1) {
		url := trimURLTail(text[loc[0]:loc[1]])
		end := loc[0] + len(url)
		b.WriteString(html.EscapeString(text[last:loc[0]]))
		esc := html.EscapeString(url)
		b.WriteString(`<a href="` + esc + `">` + esc + `</a>`)
		last = end
	}
	b.WriteString(html.EscapeString(text[last:]))
	return b.String()
}

// trimURLTail drops sentence punctuation, and a ")" with no "(" before it.
func trimURLTail(url string) string {
	for url != "" {
		c := url[len(url)-1]
		if strings.IndexByte(".,;:!?'\"", c) >= 0 || (c == ')' && !strings.Contains(url, "(")) {
			url = url[:len(url)-1]
			continue
		}
		break
	}
	return url
}

// gofeed keys this namespace as "media" whatever prefix the feed declares.
func firstMediaDescription(item *gofeed.Item) string {
	media := item.Extensions["media"]
	if groups := media["group"]; len(groups) > 0 {
		if descs := groups[0].Children["description"]; len(descs) > 0 {
			if v := strings.TrimSpace(descs[0].Value); v != "" {
				return v
			}
		}
	}
	if descs := media["description"]; len(descs) > 0 {
		return strings.TrimSpace(descs[0].Value)
	}
	return ""
}
