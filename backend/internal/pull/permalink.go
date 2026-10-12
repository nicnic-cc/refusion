package pull

import (
	"net/url"
	"strings"

	"github.com/mmcdole/gofeed"
	"github.com/mmcdole/gofeed/atom"
	"github.com/mmcdole/gofeed/rss"
)

// commentsKey carries RSS <comments>, which gofeed's universal Item drops.
const commentsKey = "refusion:comments"

// newFeedParser returns a gofeed parser that also keeps the item fields a
// permalink can come from: RSS <comments> and Atom rel="related" links.
func newFeedParser() *gofeed.Parser {
	fp := gofeed.NewParser()
	fp.RSSTranslator = rssCommentsTranslator{}
	fp.AtomTranslator = atomRelatedTranslator{}
	return fp
}

type rssCommentsTranslator struct{}

func (rssCommentsTranslator) Translate(feed any) (*gofeed.Feed, error) {
	out, err := (&gofeed.DefaultRSSTranslator{}).Translate(feed)
	if err != nil {
		return nil, err
	}
	src, ok := feed.(*rss.Feed)
	if !ok || len(src.Items) != len(out.Items) {
		return out, nil
	}
	for i, it := range src.Items {
		if strings.TrimSpace(it.Comments) == "" {
			continue
		}
		if out.Items[i].Custom == nil {
			out.Items[i].Custom = map[string]string{}
		}
		out.Items[i].Custom[commentsKey] = it.Comments
	}
	return out, nil
}

type atomRelatedTranslator struct{}

func (atomRelatedTranslator) Translate(feed any) (*gofeed.Feed, error) {
	out, err := (&gofeed.DefaultAtomTranslator{}).Translate(feed)
	if err != nil {
		return nil, err
	}
	src, ok := feed.(*atom.Feed)
	if !ok || len(src.Entries) != len(out.Items) {
		return out, nil
	}
	for i, entry := range src.Entries {
		for _, l := range entry.Links {
			if l.Rel == "related" {
				out.Items[i].Links = append(out.Items[i].Links, l.Href)
			}
		}
	}
	return out, nil
}

// findPermalink returns the item's own page on the feed's site. It applies
// only when the main link points to another host (link blogs, aggregators);
// candidates are RSS <comments>, then item links, then an http(s) GUID.
func findPermalink(item *gofeed.Item, mainLink string, base *url.URL) string {
	if base == nil || base.Hostname() == "" {
		return ""
	}
	siteHost := strings.ToLower(base.Hostname())
	if u, err := url.Parse(mainLink); err == nil && strings.ToLower(u.Hostname()) == siteHost {
		return ""
	}

	candidates := []string{item.Custom[commentsKey]}
	candidates = append(candidates, item.Links...)
	if guid := strings.TrimSpace(item.GUID); strings.HasPrefix(guid, "http://") || strings.HasPrefix(guid, "https://") {
		candidates = append(candidates, guid)
	}

	for _, raw := range candidates {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		u, err := base.Parse(raw)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			continue
		}
		host := strings.ToLower(u.Hostname())
		if host == siteHost || strings.HasSuffix(host, "."+siteHost) {
			return u.String()
		}
	}
	return ""
}
