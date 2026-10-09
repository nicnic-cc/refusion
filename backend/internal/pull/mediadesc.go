package pull

import (
	"html"
	"strings"

	"github.com/mmcdole/gofeed"
)

// mediaDescription returns media:description (plain text, e.g. YouTube Atom
// entries) as HTML. Lines end in "<br>\n": the list snippet strips tags, and
// the newline keeps lines from running together.
func mediaDescription(item *gofeed.Item) string {
	text := firstMediaDescription(item)
	if text == "" {
		return ""
	}
	text = strings.ReplaceAll(text, "\r\n", "\n")
	return strings.ReplaceAll(html.EscapeString(text), "\n", "<br>\n")
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
