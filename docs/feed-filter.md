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
  its feed's filter hides it, so reads don't change. Neither filter's
  switch tells you which one hid an article; turning one off re-checks
  every article against what is left.
- **Saving re-checks every article, one feed per short transaction.** One
  long transaction could make a pull fail after `busy_timeout` (5 s).
  The save answers with `hidden_total` (everything hidden by any filter).
- **The live preview only sees the latest 300 articles** across all feeds
  (a full run takes about 0.5-2.5 s) and says so; the exact total comes on
  save.
- **The per-feed preview applies the global filter too** and reports what
  it already hides (`global_hidden`), apart from the draft's own count.
- **No "N hidden" on the global row** (it would need re-running the
  matcher); a feed row's count includes articles hidden by either filter.
- **A feed can't opt out yet** (deferred).
