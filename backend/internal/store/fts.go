package store

import (
	"database/sql/driver"
	"fmt"
	"strings"

	"golang.org/x/net/html"
	"modernc.org/sqlite"
)

// strip_html feeds items_fts (migration 901). It must stay deterministic:
// the FTS5 'delete' command needs the exact text that was indexed, so any
// change to its output requires re-indexing every item.
func init() {
	if err := sqlite.RegisterDeterministicScalarFunction("strip_html", 1, stripHTMLFunc); err != nil {
		panic(fmt.Sprintf("register strip_html: %v", err))
	}
}

func stripHTMLFunc(_ *sqlite.FunctionContext, args []driver.Value) (driver.Value, error) {
	switch v := args[0].(type) {
	case nil:
		return nil, nil
	case string:
		return extractVisibleText(v), nil
	case []byte:
		return extractVisibleText(string(v)), nil
	default:
		return fmt.Sprint(v), nil
	}
}

var blockTags = map[string]bool{
	"address": true, "article": true, "aside": true, "blockquote": true, "br": true,
	"dd": true, "details": true, "div": true, "dl": true, "dt": true,
	"figcaption": true, "figure": true, "footer": true, "h1": true, "h2": true,
	"h3": true, "h4": true, "h5": true, "h6": true, "header": true, "hr": true,
	"li": true, "nav": true, "ol": true, "p": true, "pre": true, "section": true,
	"summary": true, "table": true, "td": true, "th": true, "tr": true, "ul": true,
}

// extractVisibleText drops markup and script/style bodies, decodes entities,
// and separates block-level elements with a space so adjacent words don't merge.
func extractVisibleText(src string) string {
	var sb strings.Builder
	z := html.NewTokenizer(strings.NewReader(src))
	skip := false

	for {
		switch tt := z.Next(); tt {
		case html.ErrorToken:
			return strings.Join(strings.Fields(sb.String()), " ")
		case html.TextToken:
			if !skip {
				sb.Write(z.Text())
			}
		case html.StartTagToken, html.EndTagToken, html.SelfClosingTagToken:
			name, _ := z.TagName()
			tag := string(name)
			if tag == "script" || tag == "style" {
				skip = tt == html.StartTagToken
			}
			if blockTags[tag] {
				sb.WriteByte(' ')
			}
		}
	}
}
