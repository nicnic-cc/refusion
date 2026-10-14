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

// countItemElements counts item/entry start elements in any namespace. A scan
// error ends the count early, so the caller keeps the count so far.
func countItemElements(body []byte) int {
	dec := xml.NewDecoder(bytes.NewReader(body))
	dec.Strict = false
	// Names are ASCII in every charset, so reading the bytes as-is is enough.
	dec.CharsetReader = func(_ string, in io.Reader) (io.Reader, error) { return in, nil }

	n := 0
	for {
		tok, err := dec.Token()
		if err != nil {
			return n
		}
		if se, ok := tok.(xml.StartElement); ok && (se.Name.Local == "item" || se.Name.Local == "entry") {
			n++
		}
	}
}
