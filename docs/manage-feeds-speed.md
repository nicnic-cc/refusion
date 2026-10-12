# Manage feeds speed (fork)

Why Manage feeds (`/feeds`) is built the way it is to open without a
freeze. Decided 2026-10-12 (epic `rf-feeds-speed`).

## How it was measured

200 feeds and ~47k articles, production build, CPU slowed 4×, page code
already loaded; the number is the main-thread freeze on open, median of
5 runs. The kit was `.research/feeds-perf/` (git-ignored, may be gone).
Base runs drift ~20 ms between sessions, so compare within one run.

## Where the time went (2026-10-12, before the fixes)

- **Open: ~730 ms** (~215 ms at normal CPU speed). Without the filter
  control in each row: ~460 ms. Without tooltips: ~515 ms. Layout and
  sidebar alone, no group cards: ~255 ms.
- **A second freeze of ~115 ms** about 1 s later, when the hidden counts
  arrived and every row's filter control redrew.
- **Not the server:** `/feeds` ~100 ms and `/filters/hidden-counts`
  ~60 ms, and neither blocks the first draw. No index work was done.

## Decisions

- **One filter dialog per page, each row reads only its own filter and
  counts** (`components/feed/feed-filter-dialog-host.tsx`,
  `useFeedFilter` and `useFeedHiddenCounts` in `queries/feed-filters.ts`).
  The per-row filter control cost ~270 ms. The page itself subscribes to neither
  query: when it did, the counts arriving redrew the whole page.
  Open freeze ~85 ms shorter; the user accepted this short of the
  100 ms target.
- **Filters and counts preload when the app loads**, which removed the
  late freeze (now 0 ms); see [feed-filter.md](feed-filter.md#global-filter).
- **One app layout above every page except `/login`**
  (`RootLayout` in `routes/__root.tsx`), so going between article lists
  and Manage feeds keeps the sidebar mounted instead of rebuilding it.
  The reading-pane choice moved into `hooks/use-reading-pane.ts`, since
  the layout no longer belongs to a page. Second visit 582 → 446 ms,
  first visit 559 → 395 ms; the user accepted the 136 ms gain against
  the 150 ms target.
- **One shared tooltip popup per app, partly done** (2026-10-12,
  `components/common/shared-tooltip.tsx`): Base UI `createHandle`, one
  Root, each icon a detached Trigger with its label as payload. Second
  visit ~450 → ~375 ms (-60 to -80 ms over three runs). Short of the
  -120 ms goal: each Trigger still runs its hover/focus hooks (disabling
  it saves nothing). The two
  tap-controlled error tooltips stay full per-icon tooltips.
- **Tooltips that build on first hover: not possible with focus intact.**
  A bare control that upgrades on first hover/focus reaches 273 ms (-170),
  but the upgrade changes the React tree above the control, so React
  replaces its DOM node and a Tab-focused icon loses focus. Only a hand-
  written hover/focus layer over one moving anchor would do both; not built.
