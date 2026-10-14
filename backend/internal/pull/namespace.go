package pull

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
)

// checkItemNamespace turns "parsed OK but 0 items" into an error when the body
// does hold <item>/<entry> elements: gofeed drops items in a namespace it does
// not recognise without any error, which would let the feed stall silently.
func checkItemNamespace(body []byte, parsedItems int) error {
	if parsedItems > 0 {
		return nil
	}
	if n := countItemElements(body); n > 0 {
		return fmt.Errorf("parse feed: %d items in an XML namespace the parser does not recognise", n)
	}
	return nil
}

// countItemElements counts feed-level item/entry start elements in any
// namespace: RSS items under channel or the root, Atom entries under the root
// feed. Nested lookalikes (xhtml, extensions) and non-XML bodies do not count.
// A scan error ends the count early, so the caller keeps the count so far.
func countItemElements(body []byte) int {
	if !looksLikeXML(body) {
		return 0
	}
	dec := xml.NewDecoder(bytes.NewReader(body))
	dec.Strict = false
	// Names are ASCII in every charset, so reading the bytes as-is is enough.
	dec.CharsetReader = func(_ string, in io.Reader) (io.Reader, error) { return in, nil }

	n := 0
	var path []string // local names of the open elements
	for {
		tok, err := dec.Token()
		if err != nil {
			return n
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if isFeedLevelItem(path, t.Name.Local) {
				n++
			}
			path = append(path, t.Name.Local)
		case xml.EndElement:
			if len(path) > 0 {
				path = path[:len(path)-1]
			}
		}
	}
}

// isFeedLevelItem reports whether an element named local opened under path is
// an RSS/RDF item (under channel or the root) or an Atom entry (under feed).
func isFeedLevelItem(path []string, local string) bool {
	switch local {
	case "item":
		return len(path) == 1 || (len(path) == 2 && path[1] == "channel")
	case "entry":
		return len(path) == 1 && path[0] == "feed"
	}
	return false
}

// looksLikeXML skips an optional UTF-8 BOM and whitespace, so JSON feeds are
// never scanned for tags that appear inside their strings.
func looksLikeXML(body []byte) bool {
	body = bytes.TrimPrefix(body, []byte("\xef\xbb\xbf"))
	body = bytes.TrimLeft(body, " \t\r\n")
	return len(body) > 0 && body[0] == '<'
}
