# Reading speed (fork)

Why the daily reading loop (switching feeds, scrolling, `j`/`k`, opening
and marking articles, cold start) is built the way it is. Decided
2026-10-12 (epic `rf-reading-speed`).

## How it was measured

200 invented feeds and ~47k articles, production build, headless Chrome
at 1440×900, CPU slowed 4×, median of 3 runs. "Input" is the Event Timing
duration from a key press or click to the next paint. The kit was
`.research/reading-perf/` (git-ignored, may be gone). Base runs drift
between sessions, so compare old and new binaries within one session.

## Where the time went (2026-10-12, before the fixes)

- **`j`: 112 ms per press**, 19 of 20 presses over 50 ms, and 1 of 20
  swallowed at the end of a page. With 500 rows loaded: 152 ms.
- **Feed click:** 136 ms input, 178 ms until the new list showed
  (255 ms with 100 ms of added network latency).
- **Reload to first row:** 262 ms (592 ms at +100 ms); cold start 603 ms
  (1148 ms).
- **A stale 500-row list** refetched all 50 pages one after another:
  2.5 s locally before new articles appeared.
- **Not slow:** scrolling, `m` and `Shift+A` had no long tasks.

## Decisions

- **Sidebar rows render only when their own data changes.** The sidebar
  re-rendered all ~200 rows twice per `j`, since it read the whole URL
  and the whole UI store. Reading only the slice it needs gave `j` 128 →
  40 ms with no slow presses, and feed click 152/193 → 48/102 ms.
- **A `j` press re-renders only the two rows whose selection changed**,
  so 500 loaded rows cost the same as 10. Left as is: with mark-read on
  open, the unread flip still makes every row check its props, because the
  data really changed.
- **The next page loads ahead, and `j` at the last loaded row loads more
  in both loading modes.** In button mode a key press counts as asking,
  like clicking the button; scrolling there still never loads. The list
  scrolls so its footer (spinner or button) shows under the last row.
  The next page is requested as soon as the selection enters the last
  loaded page, so holding `j` doesn't pause at page ends; the cost is one
  extra page for a list left early.
- **A stale list refetches only its first page** (`pages: 1` on
  `itemQueries.list`), so one request instead of one per loaded page.
  Because that reset jumps to the top, background reloads of the open
  list were stopped; see
  [fetch-progress.md](fetch-progress.md#decisions). After a reset in the
  all view, `j` loads pages until the open article is back (at most 20)
  and moves on from it; in unread it was read away, so `j` starts at the
  top.
- **Crossing the panes/drawer width keeps the list mounted** (same tree
  position in both modes), so it neither jumps to the top nor refetches.
  Accepted: dragging the window re-wraps rows in drawer mode, and the
  browser's scroll anchoring lets the list drift a row or so per drag. A
  custom anchor wasn't worth the code for something done this rarely.
- **Startup doesn't wait in line.** The settings fetch runs alongside the
  session check and is applied only once the session is confirmed;
  matched route chunks load at startup.
- **A feed's list starts loading on pointerdown** (and just before
  keyboard open), only when it isn't cached. Not on hover: that would
  fire requests for 200 rows.
- **Mark read doesn't wait for `/feeds`.** The optimistic update already
  set the counts. It cancels only the queries it overwrites, so an
  in-flight next-page load survives, and lists that don't hold the item
  keep their cache entries unchanged.
- **Article HTML is cleaned once per article and full-text toggle**
  (`useMemo` in `article-view.tsx`), not on every re-render. Images get
  `loading="lazy"` and `decoding="async"`.
- **Dialogs stay in the entry chunk.** Moving them out cut it from 362 to
  271 KB, but startup didn't change beyond noise, so it wasn't kept.
- **Not reproduced:** auto mark-read skipping articles during fast `j`
  (`j` every 250 ms, 0 of 20 left unread on a local server).
