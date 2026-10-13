# Article views (fork)

An open article shows one of three views: the feed's own text (`feed`), the
full article extracted from the site (`full`, key `w`), or the original web
page in an iframe (`web`, key `shift+w`). The state lives in
`frontend/src/hooks/use-article-view-state.ts`.

## Default view per feed

- Each feed picks the view its articles open in (`feeds.default_view`).
- A pick for one article is kept only while that article is open. The next
  article opens in its feed's default again.
- Pressing a view's key while it is showing leaves it for the feed's default,
  or for feed text when it already is the default (`lib/article-view.ts`).
- A failed full article load falls back the same way and shows a toast, so a
  feed whose default is `full` doesn't spin forever.
- Starred copies of deleted items (negative ids) only have feed text: there is
  no item for the server to fetch.

Breaking change (2026-10-12, migration 905): `default_view` replaced the
boolean `full_content` feed field. Stored `full_content = 1` became `full`.
API clients that send or read `full_content` must switch to `default_view`.

## Full article

`GET /items/:id/full-content` fetches the page and extracts the article with
readability on every open; nothing is stored, so the text is always the
site's current one. Per-site extraction rules are undecided (bead
`rf-fulltext-rules`).

## Web page

The iframe always loads our own route (`GET /items/:id/page`,
`getItemPage`), never the site directly:

- A page that allows framing and is https gets a redirect, so the real site
  loads as it is.
- Anything else is served as a copy with a CSP `sandbox` header (no
  `allow-same-origin`), so its scripts run in an opaque origin and cannot
  call our API with the session cookie. Plain http is copied too, since
  framing it would be mixed content.
- A feed with custom CSS (`feed_web_css`) is always copied, since a
  redirected page can't be changed. The copy's meta CSP tags are dropped so
  they can't block the injected style.
- Accepted cost: script-heavy sites may break in the opaque origin.

## Item permalink

Link blogs and aggregators point an item's main link at another site. The
item's own page on the feed's site (`items.permalink`) is opened instead when
the feed sets `open_permalink`; this applies to the open icon, the full
article and the web page. Decisions (2026-10-12):

- Generic, no per-site rules. Only looked for when the main link's host
  differs from the feed's site host; the first candidate on that host (or a
  subdomain) wins: RSS `<comments>`, item links, a URL GUID
  (`pull/permalink.go`).
- No links taken from the content: they picked tag or about pages.
- gofeed v1.4.0 drops RSS `<comments>` and Atom `rel="related"` links from its
  universal item, so both are added back by translator wrappers. Atom
  `rel="self"` entry links (the entry's own feed URL) are removed there.
- The insert keeps `ON CONFLICT DO NOTHING` (its row count is the new-items
  count); items stored earlier get their permalink by a separate `UPDATE`.
