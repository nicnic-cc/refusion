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
