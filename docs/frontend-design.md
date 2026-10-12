# refusion Frontend Design

## 1. Goals

- Keep interactions fast and keyboard-friendly.
- Keep state predictable by encoding major UI state in URL params.
- Prioritize readability and simple information architecture.

## 2. Stack decisions

Dependencies live in `frontend/package.json` — do not restate them here.
The choices worth knowing: TanStack Router because routes are typed files
under `frontend/src/routes/` (the route inventory is those files, not a
table here); TanStack Query owns server-state caching so Zustand holds
only transient UI state; shadcn/ui components are vendored into
`src/components/ui/` and regenerated via the CLI rather than hand-edited
(see AGENTS.md).

## 3. URL-driven app state

Reading state is split between path params and search params:

| Location     | Key       | Type                       | Meaning                  |
| ------------ | --------- | -------------------------- | ------------------------ |
| Path param   | `filter`  | `all \| unread \| starred` | Active article filter    |
| Path param   | `feedId`  | number                     | Selected feed scope      |
| Path param   | `groupId` | number                     | Selected group scope     |
| Search param | `article` | number                     | Opened article (drawer or reading pane); negative = a starred article whose item was deleted (`-bookmark.id`) |

Examples:

- `/unread`
- `/feeds/6/unread`
- `/groups/3/starred?article=289`

Scope and filter each have one control: the sidebar sets only the scope, the
switch in the sidebar header sets only the filter. Rows that set both drifted
out of sync with the switch, which keeps the scope. Under Unread and Starred the
sidebar hides feeds with nothing matching, but keeps every feed it showed since
the view was entered, so reading or marking all read doesn't pull rows away.

This keeps list context stable while opening/closing article detail. `g u` /
`g a` / `g s` switch the filter of the current view, `g h` / `g f` jump to all feeds / feed management; all are navigation sugar over the same URLs.

## 4. Layout system

### Desktop

- Fixed left sidebar (`300px`)
- Main content on the right
- Article detail opens in a right-side drawer or, with the panes layout, in a column beside the article list; windows narrower than 1280px use the drawer even with panes chosen, since the article column would be too narrow

### Mobile

- Sidebar is a left sheet/drawer
- Main content remains single-column
- Modals/drawers share the same UI flow as desktop

The reading view is an infinite list with per-card read/star quick actions
(its all/unread/starred switch sits in the sidebar header, see section 3); the article drawer shows sanitized full
content (`lib/content.ts`) with source link and prev/next navigation; feed
management (`/feeds`) hosts grouped feed/group CRUD, refresh-all, reorder
mode, the per-feed and global filters, and OPML import/export. Component names map to these areas directly — browse
`frontend/src/components/` for the implementation.

Icon controls get the styled tooltip (`components/common/tooltip-button.tsx`,
or `with-tooltip.tsx` to keep a control's own markup), never a native
`title=`, which looks out of place and shows late. Done on `/feeds` and the
sidebar so far.

Every feed has a folder: "no folder" means the backend's fallback group
(`DEFAULT_GROUP_ID` in `lib/groups.ts`), which the sidebar hides while
empty. A nullable `group_id` with top-level feeds was rejected: the Fever
API and OPML both assume a group per feed, and it would drift from upstream.

## 5. Data flow

- API layer lives in `frontend/src/lib/api/`
- Query logic lives in `frontend/src/queries/`
- TanStack Query handles:
  - cursor-based pagination for items and bookmarks (opaque `next_cursor` passed as the `before` query param; `next_cursor` is null when no more pages exist)
  - optimistic read/unread updates
  - cache invalidation after mutations
- Zustand stores transient UI state (dialogs, mobile sidebar, edit targets).
  The preferences store is the exception: it is a localStorage-backed local
  cache of the user's synced settings (`lib/settings-sync.ts` pulls the
  server values once per page load before the first authenticated screen
  renders, server non-null values win, and each settings-dialog change
  PATCHes only the changed key). The reading layout is the one preference
  kept per device and never synced. Theme lives in next-themes' own
  localStorage key and is mirrored through the same sync.

### Read-state changes: grayed rows are an undo affordance, not stale UI

Marking an item read in the **unread** view keeps the row in the list, grayed out, instead of removing it. This is deliberate: the row can be toggled back to unread in place, without hunting it down in the all view. Items marked read from any other view (all, starred, search) are committed immediately.

The "still undoable" state is scoped to the exact list being viewed (feed + group + filter identity):

- Read-state mutations update cached items in place and deliberately never invalidate item list queries — list membership stays frozen at fetch time.
- The unread view renders `unread || pinned`. Pins are per-list-identity view state (`frontend/src/store/article-pins.ts`), written only when marking read inside an unread view.
- Leaving the list — switching filter or feed/group scope, or unmounting the reading view — clears the pins and commits: read rows drop out of the unread view without a refetch. The all view still shows them, so undo remains possible after the fact.
- Keyboard navigation is unaffected: pinned gray rows stay in the article id list, keeping `j`/`k` indices stable.

Known edge: marking an item unread from the all view does not insert it into an already-cached unread list; cache staleness/refetch covers it eventually.

Star/bookmark changes are deliberately the opposite pattern: un-starring removes the row from the starred view immediately (optimistic removal from every bookmark list cache, then invalidation to reconcile — see `useDeleteBookmark`), because a bookmark toggle is its own undo and needs no lingering row. Only read-state changes defer list membership.

Before filing "marked-read items still show up in the unread list" as a bug, check which half is reported: grayed rows while staying in the same unread list are this design working; rows surviving a filter/scope switch was the actual defect, fixed by the pin scoping (#262, #266).

## 6. Search and bookmarks

- Unified search (`GET /api/search`) returns feeds and items in one
  request; results open the feed context or article drawer. Article
  results show an excerpt with matched words bold, built in Go because
  `items_fts` can't give clean snippets (migration 901).
- The "starred" view is powered by bookmarks, which are content
  snapshots — starred items survive deletion of the source feed/item
  (see the bookmarks rationale in `backend-design.md` §5).
- Star state matches by item id, then by link: `bookmarks.link` is unique,
  so the same article cross-posted in two feeds shows starred in both.

## 7. Keyboard interactions

The app is keyboard-first. Shortcut categories: search/dialog toggles, article navigation (next/previous), sidebar tree navigation (Shift chords, which article keys ignore), read/star toggles, filter switches and jumps (`g u` / `g a` / `g s` / `g h` / `g f`), and `?` for in-app help. The authoritative binding list lives in the shortcuts help dialog and its source; avoid duplicating it here so docs and code do not drift.

## 8. Authentication UX

- Password login is available when password auth is enabled
- If password is empty and OIDC is not configured, the UI is directly accessible without `/login`
- When OIDC is enabled, login page shows "Sign in with OIDC"
- OIDC callback failure is surfaced as `/login?error=oidc_failed`
