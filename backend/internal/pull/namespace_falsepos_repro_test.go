package pull

import "testing"

// Proves a valid feed with 0 real items must not trip the unknown-namespace
// error just because an unrelated item/entry start tag appears in the body.
func TestFetchAndParseEmptyFeedNoFalseNamespaceError(t *testing.T) {
	tests := []struct {
		name  string
		ctype string
		body  string
	}{
		{"json feed with item text in title", "application/feed+json",
			`{"version":"https://jsonfeed.org/version/1.1","title":"T <item>","items":[]}`},
		{"atom entry inside xhtml subtitle", "application/atom+xml",
			`<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">` +
				`<title>T</title><id>urn:x</id>` +
				`<subtitle type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><entry>x</entry></div></subtitle></feed>`},
		{"rss extension element named item", "application/rss+xml",
			rssFeed(` xmlns:x="http://example.com/x"`, `<x:related><x:item>a</x:item></x:related>`)},
		{"control: rss with no stray tags", "application/rss+xml", rssFeed("", "")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := fetchBody(t, tt.ctype, tt.body)
			if err != nil {
				t.Fatalf("err = %v, want nil", err)
			}
			if len(result.Items) != 0 {
				t.Fatalf("items = %d, want 0", len(result.Items))
			}
		})
	}
}
