# Fetch progress (fork)

Pull to refresh, check progress, the "N new articles" pill and per-feed
check state. Code: `backend/internal/pull/progress.go`,
`backend/internal/handler/pull.go`, and in `frontend/src/`:
`store/pull.ts`, `queries/pull.ts`, `hooks/use-pull-*.ts`,
`hooks/use-list-pull.ts`, `hooks/use-new-articles.ts`. Decided 2026-10-10,
after reading how yarr does it.

## Decisions

- **The page polls, the server never pushes.** `GET /api/pull/status`
  every 1 s while feeds are pending, every 60 s otherwise, and right away
  when the tab becomes visible again (hidden tabs skip polls). The status
  lives in memory; a restart clears it.
- **Only checks the user starts are tracked**: pull, `r`, `Shift+R`, add
  feed, OPML import, "Check now". Scheduled fetches stay silent and only
  refresh unread counts: they run one feed at a time as feeds come due, so
  progress would flicker all day.
- **Feeds are marked pending before `POST /api/pull` returns.** Otherwise
  the first status poll can land before the fetch starts and the run reads
  as "Nothing new".
- **Each pane shows its own runs.** A pull in the article list shows its
  progress there; everything else (sidebar pull, `Shift+R`, add, import,
  Check now) shows at the top of the sidebar. A check started during
  another run joins it.
- **Trackpad pull is built on wheel events**, and a gesture counts only if
  it starts after a 200 ms pause with the pane already at the top. A
  trackpad keeps sending momentum events after the fingers lift, so a fast
  scroll to the top would otherwise fire a check.
- **Background arrivals never move the open list.** The list remembers the
  server's newest item id right after it loads (`last_item_id`); newer
  items show as a pill (`GET /api/pull/new-count`), and a click reloads.
  Items saved between the list fetch and that snapshot are missed rather
  than double-counted. New rows get a fading tint because the list is
  sorted by publish date, so they can land mid-list. A finished check or a
  network reconnect doesn't reload an open list either (decided
  2026-10-12: the app doesn't move what you're reading unless you asked),
  with one exception: a list showing only its first page, scrolled to the
  top, reloads in place when a check ends. Lists that aren't on screen
  are still marked stale.
- **The row warning icon has no failure threshold**: it follows
  `last_error` and clears on the next successful check, like the /feeds
  page's error filter.
- **Adding a feed tries the URL as a feed first.** `feedfinder.Find` waits
  for its well-known-path probing (up to 20 sequential GETs) even when the
  URL already is a feed: 4.6 s vs 0.5 s for one fetch, measured on
  `go.dev/blog/feed.atom`. Probing still runs for web pages.

## Gotchas

- **`next_check_at = 0` does not mean "due now".** It means "no schedule
  yet": `pullpolicy.ShouldSkip` falls back to `last_checked_at` + interval.
  And when a past due time survives a pass, `Puller.scheduleDelay` reads it
  as a failed state write and sleeps a full interval. To make a feed due
  in dev, set a time ~30 s ahead and restart the backend: its first pass
  sleeps until that time. Waking it with a feed `PATCH` (`updateFeed`
  calls `Wake()`) worked once and failed once on 2026-10-10, not
  investigated.
- **The sqlite3 CLI cannot delete or retitle items**: the `items_fts`
  triggers call `strip_html`, which only the Go app registers. To make a
  feed's items count as new again, change their `guid` (the dedup key is
  `feed_id, guid`); the old rows stay as duplicates.

## Live state

```
curl -s -b <session-cookie-jar> localhost:8080/api/pull/status
```
