package pull

import "testing"

// An Atom rel="self" link is the entry's own feed document, not its page, so it
// is never a permalink; rel="related" on the site still is.
func TestPermalinkIgnoresAtomSelfLink(t *testing.T) {
	got := parsePermalinks(t, `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>News</title><link href="http://example-news.test"/>
<entry><id>tag:elsewhere.test,1</id><title>A</title>
<link rel="alternate" href="http://other.example.org/article"/>
<link rel="self" href="http://example-news.test/entries/1.atom"/>
<updated>2026-01-01T00:00:00Z</updated></entry>
<entry><id>tag:elsewhere.test,2</id><title>B</title>
<link rel="alternate" href="http://other.example.org/article-b"/>
<link rel="related" href="http://example-news.test/posts/1"/>
<updated>2026-01-01T00:00:00Z</updated></entry>
</feed>`)
	if got[0] != "" {
		t.Errorf("self-link entry permalink = %q, want empty", got[0])
	}
	if got[1] != "http://example-news.test/posts/1" {
		t.Errorf("control: related-link entry permalink = %q", got[1])
	}
}
