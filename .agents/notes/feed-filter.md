# Feed filter (fork)

One filter per feed hides articles, edited from Manage feeds with a live
preview. Modelled on Inoreader's per-feed filter. Code:
`backend/internal/filter/filter.go` (the matcher, and the triggers and
operators it supports), `backend/internal/store/filter.go`, and in
`frontend/src/`: `components/feed/filter-dialog.tsx`,
`hooks/use-show-filtered.ts`. Decided 2026-10-11.

## Decisions

- **A stored `filtered` flag on each item, set by one Go matcher.** The
  same matcher runs in the preview, on save (re-checks every stored
  article of the feed) and on pull (new articles), so the preview always
  matches what saving does. Rejected: filtering in SQL at read time (a
  regex per row on every count refresh), and dropping articles at pull
  (can't be undone, and the preview couldn't show what would be lost).
- **One filter per feed, Remove or Keep, joined by one And/Or.** No mixing
  of And and Or, and one "Whole words only" for the whole filter, which
  doesn't apply to the regex operators. Every operator ignores case, and
  the dialog says so.
- **Left out on purpose:** author, attachments, RSS categories, language
  and mentions as triggers.
- **Hidden means hidden everywhere:** lists, counts, the new-articles
  pill, mark-all-read, search and Fever. Only the "show filtered" toggle
  in a single-feed view lists them, dimmed, without changing any count.
  The toggle is not in the URL and turns off when the list closes or
  another view opens.
- **The switch turns off the whole filter, not single conditions.** Off or
  delete clears the feed's flags, so articles come back with their
  read/unread state; on re-checks every article.
- **The newest-item marker counts filtered items too**, so turning a
  filter off doesn't light the new-articles pill for old articles.
- **Live preview, 0.3 s after each edit**, cancelling the previous
  request. Measured 3–8 ms per run on the largest feed (118 articles,
  2026-10-11); the plan was to switch to a Preview button above about
  200 ms.

## Global filter

One extra filter hides articles in every feed. Code:
`backend/internal/store/global_filter.go`, `migrations/904_global_filter.sql`,
`activeMatchers` in `store/filter.go`. Decided 2026-10-11.

- **Remove only.** A global Keep would hide almost everything.
- **Own one-row table, not a nullable `feed_id`** in `feed_filters`: that
  is the primary key, so changing it means rebuilding the table and
  touching every query.
- **Same `filtered` flag:** an article is hidden if the global filter or
  its feed's filter hides it, so reads don't change. Turning one filter
  off re-checks every article against what is left.
- **`filtered_global` tells them apart:** 1 only when the global filter
  hides the article and the feed's own filter does not (the feed filter
  wins), so a feed's two counts add up to everything hidden in it. Every
  write of `filtered` sets both columns in one statement. It is filled
  into the item JSON by `store/filter_counts.go`, apart from the upstream
  item queries.
- **Saving re-checks every article, one feed per short transaction.** One
  long transaction could make a pull fail after `busy_timeout` (5 s).
  The save answers with `hidden_total` (everything hidden by any filter).
- **The live preview only sees the latest 300 articles** across all feeds
  (a full run takes about 0.5-2.5 s) and says so; the exact total comes on
  save.
- **The per-feed preview applies the global filter too** and reports what
  it already hides (`global_hidden`), apart from the draft's own count.
- **A feed row shows its counts in the grey text,** from
  `GET /filters/hidden-counts` (one `GROUP BY`): an eye icon with the
  articles shown, then an icon and count per filter that hides something
  (global, folder, feed), each named in its tooltip. The filter button
  shows only the feed's own setting. Decided 2026-10-25: counts on the
  button and "N by global" badges beside it read as one jumble once
  folder filters stacked on top. The global and folder rows have no count.
- **The app preloads filters and counts on load**
  (`usePrefetchFilterViews` in the app layout), so Manage feeds draws them
  in its first pass: their late arrival redrew every row, a ~120 ms freeze
  with 200 feeds at 4x slower CPU.
- **A feed can't opt out yet** (deferred).

## Folder filter

One filter per folder hides articles in every feed of the folder. Code:
`backend/internal/store/group_filter.go`,
`migrations/908_group_filter.sql`, `activeMatchers` in `store/filter.go`.
Decided 2026-10-25.

- **One rule: an article is hidden if any filter hides it** (global, its
  folder's, its feed's). No level can un-hide, so order doesn't matter.
  Each feed is in exactly one folder, so at most three filters check an
  article.
- **Remove or Keep,** like a feed filter. The global filter stays Remove
  only.
- **Blame goes to the most specific filter: feed, then folder, then
  global.** `filtered_group` = 1 when the folder filter hides the article
  and the feed filter doesn't. `filtered_global` = 1 only when the global
  filter alone hides it. A feed's three counts add up to everything hidden
  in it, and the "show filtered" tag names the blamed filter ("Feed
  filter", "Folder filter" or "Global filter").
- **Re-check triggers:**
  1. Saving, switching or deleting a folder filter re-checks each feed of
     the folder, one feed per short transaction. It answers with
     `hidden_total`: everything hidden in the folder's feeds.
  2. Moving a feed to another folder re-checks it inside `UpdateFeed`'s
     transaction.
  3. Deleting a folder moves its feeds to Default, so they fall under
     Default's filter. `DeleteGroup` re-checks them after commit.
  4. New feeds (create, OPML import) need none: they have no articles yet,
     and the pull reads the folder at insert time.
- **The folder preview is a sample** of the latest 300 articles in the
  folder, like the global preview. The feed preview does not apply the
  folder filter.
- **No per-feed opt-out** from the folder filter.
- **Manage feeds:** the folder card has its own filter button and switch
  (`GroupFilterControl` in `components/feed/feed-filter-control.tsx`).
  Moving a feed or deleting a folder calls `invalidateFilterViews`, or
  lists and counts would show the old folder's result until the next
  refetch.
