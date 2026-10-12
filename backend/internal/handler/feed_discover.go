package handler

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/0x2E/feedfinder"
	"github.com/0x2E/fusion/internal/pkg/httpc"
	"github.com/PuerkitoBio/goquery"
	"github.com/mmcdole/gofeed"
)

// maxDiscoveryBytes mirrors the pull package's per-feed body cap, so a page
// that validates here is not rejected on the first pull.
const maxDiscoveryBytes = 20 << 20

var errBodyTooLarge = errors.New("response body too large")

var reYouTubeBrowseID = regexp.MustCompile(`{"key":"browse_id","value":"(.+?)"}`)

var wellKnownFeedPaths = []string{
	"atom.xml", "feed.xml", "rss.xml", "index.xml",
	"atom.json", "feed.json", "rss.json", "index.json",
	"feed/", "rss/",
}

// fetchCapped GETs rawURL with the guarded client and reads at most
// maxDiscoveryBytes. The URL check up front rejects internal literals early;
// the client re-checks at dial time and on redirects.
func fetchCapped(ctx context.Context, client *http.Client, rawURL string, allowPrivate bool) ([]byte, error) {
	if err := httpc.ValidateRequestURL(ctx, rawURL, allowPrivate); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	httpc.SetDefaultHeaders(req)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bad status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxDiscoveryBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxDiscoveryBytes {
		return nil, errBodyTooLarge
	}
	return body, nil
}

type feedDiscoverer struct {
	client       *http.Client
	target       *url.URL
	proxy        string
	allowPrivate bool
}

// discoverFeeds replaces feedfinder.Find, whose HTTP client cannot be swapped
// and so bypasses the dial-time IP check, redirect validation and body cap.
func discoverFeeds(ctx context.Context, target, proxy string, allowPrivate bool) ([]feedfinder.Feed, error) {
	u, err := url.Parse(target)
	if err != nil {
		return nil, err
	}
	client, err := httpc.NewClient(30*time.Second, proxy, allowPrivate)
	if err != nil {
		return nil, err
	}
	d := &feedDiscoverer{client: client, target: u, proxy: proxy, allowPrivate: allowPrivate}

	if feeds := d.fromService(ctx); len(feeds) != 0 {
		return feeds, nil
	}

	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		feedMap = make(map[string]feedfinder.Feed)
	)
	collect := func(found []feedfinder.Feed) {
		mu.Lock()
		defer mu.Unlock()
		for _, f := range found {
			feedMap[f.Link] = f
		}
	}
	wg.Add(2)
	go func() {
		defer wg.Done()
		collect(d.fromPage(ctx))
	}()
	go func() {
		defer wg.Done()
		found := d.fromWellKnown(ctx, fmt.Sprintf("%s://%s%s", u.Scheme, u.Host, u.Path))
		if len(found) == 0 {
			found = d.fromWellKnown(ctx, fmt.Sprintf("%s://%s", u.Scheme, u.Host))
		}
		collect(found)
	}()
	wg.Wait()

	res := make([]feedfinder.Feed, 0, len(feedMap))
	for _, f := range feedMap {
		res = append(res, f)
	}
	return res, nil
}

func hostIs(host, domain string) bool {
	return host == domain || strings.HasSuffix(host, "."+domain)
}

// fromService handles known sites. GitHub and Reddit feeds are derived from
// the URL alone, so feedfinder is only used there; an unmatched path would make
// it fetch from the same public host, which is accepted. YouTube needs a page
// fetch and goes through the guarded client.
func (d *feedDiscoverer) fromService(ctx context.Context) []feedfinder.Feed {
	host := d.target.Hostname()
	switch {
	case hostIs(host, "github.com"), hostIs(host, "reddit.com"):
		var o *feedfinder.Options
		if d.proxy != "" {
			o = &feedfinder.Options{RequestProxy: &d.proxy}
		}
		feeds, _ := feedfinder.Find(ctx, d.target.String(), o)
		return feeds
	case hostIs(host, "youtube.com"), hostIs(host, "youtu.be"):
		return d.youtubeFeeds(ctx)
	}
	return nil
}

func (d *feedDiscoverer) youtubeFeeds(ctx context.Context) []feedfinder.Feed {
	if strings.HasPrefix(d.target.Path, "/playlist") {
		id := d.target.Query().Get("list")
		if id == "" {
			return nil
		}
		return []feedfinder.Feed{{Title: "Playlist", Link: "https://www.youtube.com/feeds/videos.xml?playlist_id=" + url.QueryEscape(id)}}
	}
	if !strings.HasPrefix(d.target.Path, "/@") {
		return nil
	}
	content, err := fetchCapped(ctx, d.client, d.target.String(), d.allowPrivate)
	if err != nil {
		return nil
	}
	match := reYouTubeBrowseID.FindSubmatch(content)
	if len(match) < 2 || len(match[1]) == 0 {
		return nil
	}
	return []feedfinder.Feed{{Title: "Channel", Link: "https://www.youtube.com/feeds/videos.xml?channel_id=" + url.QueryEscape(string(match[1]))}}
}

func (d *feedDiscoverer) fromPage(ctx context.Context) []feedfinder.Feed {
	content, err := fetchCapped(ctx, d.client, d.target.String(), d.allowPrivate)
	if err != nil {
		return nil
	}

	if feeds := d.parseHTML(ctx, content); len(feeds) != 0 {
		for i := range feeds {
			feeds[i].Link = resolveLink(d.target.String(), feeds[i].Link)
		}
		return feeds
	}

	if feed, ok := parseFeedContent(content); ok {
		if feed.Link == "" {
			feed.Link = d.target.String()
		}
		return []feedfinder.Feed{feed}
	}
	return nil
}

func (d *feedDiscoverer) parseHTML(ctx context.Context, content []byte) []feedfinder.Feed {
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(content))
	if err != nil {
		return nil
	}

	feeds := make([]feedfinder.Feed, 0)
	pageTitle := doc.FindMatcher(goquery.Single("title")).Text()
	for _, typ := range []string{"application/rss+xml", "application/atom+xml", "application/json", "application/feed+json"} {
		doc.Find("head").Find("link[type='" + typ + "']").Each(func(_ int, s *goquery.Selection) {
			title, _ := s.Attr("title")
			link, _ := s.Attr("href")
			if title == "" {
				title = pageTitle
			}
			feeds = append(feeds, feedfinder.Feed{Title: title, Link: link})
		})
	}

	suspected := make(map[string]struct{})
	doc.Find("body").Find("a").Each(func(_ int, s *goquery.Selection) {
		if !strings.Contains(strings.ToLower(s.Text()), "rss") {
			return
		}
		if link, ok := s.Attr("href"); ok {
			suspected[link] = struct{}{}
		}
	})
	for link := range suspected {
		abs := resolveLink(d.target.String(), link)
		if feed, ok := d.probe(ctx, abs); ok {
			feed.Link = abs
			feeds = append(feeds, feed)
		}
	}
	return feeds
}

func (d *feedDiscoverer) fromWellKnown(ctx context.Context, baseURL string) []feedfinder.Feed {
	feeds := make([]feedfinder.Feed, 0)
	for _, suffix := range wellKnownFeedPaths {
		candidate, err := url.JoinPath(baseURL, suffix)
		if err != nil {
			continue
		}
		if feed, ok := d.probe(ctx, candidate); ok {
			feed.Link = candidate
			feeds = append(feeds, feed)
		}
	}
	return feeds
}

func (d *feedDiscoverer) probe(ctx context.Context, rawURL string) (feedfinder.Feed, bool) {
	content, err := fetchCapped(ctx, d.client, rawURL, d.allowPrivate)
	if err != nil {
		return feedfinder.Feed{}, false
	}
	return parseFeedContent(content)
}

func parseFeedContent(content []byte) (feedfinder.Feed, bool) {
	parsed, err := gofeed.NewParser().Parse(bytes.NewReader(content))
	if err != nil || parsed == nil {
		return feedfinder.Feed{}, false
	}
	feed := feedfinder.Feed{Title: parsed.Title, Link: parsed.FeedLink}
	return feed, feed != feedfinder.Feed{}
}

func resolveLink(base, link string) string {
	if link == "" {
		return base
	}
	linkURL, err := url.Parse(link)
	if err != nil || linkURL.IsAbs() {
		return link
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return link
	}
	return baseURL.ResolveReference(linkURL).String()
}
