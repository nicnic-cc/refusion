# Notes

Why the code is the way it is, for working on it. Pages for people
running refusion live in [`docs/`](../../docs/README.md); local setup and
checks in [`dev.md`](../dev.md).

## How documentation is written here

- Code is the single source of truth for what it does. Docs answer
  **why**: design decisions, trade-offs, history, and cross-cutting rules
  that are scattered across the code.
- Never copy facts that already live in a file — versions, dependencies,
  route inventories, env-var lists and defaults, schema fields. Link to
  the file instead. The usual truth sources: `backend/go.mod`,
  `frontend/package.json`, `SetupRouter` in
  `backend/internal/handler/handler.go`,
  `backend/internal/store/migrations/`, `frontend/src/routes/`,
  [`.env.example`](../../.env.example).
- Each fact lives in exactly one place. Breaking-change notes and other
  history are kept once, in the doc that owns the topic.
- Update docs together with any behavior or contract change they
  describe; if code and a doc disagree, the code wins and the doc is a
  bug.

## Index

- `api-conventions.md`: cross-cutting HTTP API rules (auth, envelopes,
  cursors, errors, status codes)
- `fever-api.md`: Fever protocol compatibility, an external contract
  with third-party clients (client setup for people: `docs/apps.md`)
- `backend-design.md`: backend architecture, feed pull strategy, schema
  and cascade design
- `frontend-design.md`: frontend interaction model, URL state, data-flow
  and read-state undo design
- `article-views.md` (fork): feed text, full article and web page views,
  the per-feed default view, web page sandboxing and item permalinks
- `fetch-progress.md` (fork): pull to refresh, check progress, the new
  articles pill and per-feed check state
- `feed-filter.md` (fork): the per-feed and global article filters, why
  items carry a stored `filtered` flag, and what "hidden" covers
- `manage-feeds-speed.md` (fork): why Manage feeds keeps one filter
  dialog and one app layout, with the measured freeze numbers
- `reading-speed.md` (fork): why the reading loop (j/k, feed switch,
  mark read, startup) is built for speed, with the measured numbers
- `old-database-schema.md`: legacy pre-migrations schema snapshot, kept
  for migration work only
