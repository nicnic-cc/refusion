<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo/refusion-logo-dark.svg" />
    <img src="./assets/logo/refusion-logo.svg" alt="refusion" height="72" />
  </picture>
</p>
<p align="center">A lightweight, self-hosted RSS reader. A fork of <a href="https://github.com/0x2E/fusion">Fusion</a>.</p>

<p align="center">
  <img src="./assets/screenshots/panes.png" alt="Panes layout: sidebar, article list and the open article side by side" width="100%" />
</p>
<p align="center">
  <img src="./assets/screenshots/drawer.png" alt="Drawer layout: the open article slides over the list" width="100%" />
</p>

## What refusion adds

- **Two reading layouts:** Drawer opens articles over the list. Panes shows them in a third column beside it on wide screens, and falls back to Drawer on narrower ones.
- **Full article text:** fetch the whole article from the site on demand (`w`), or turn on "Always load full article" for a feed.
- **YouTube embeds:** YouTube items play inside the article view. Items with only `media:description` show it as the content, with links made clickable.
- **Search with excerpts:** results show an excerpt with the matched words in bold.
- **Checking for new articles:** pull to refresh in the sidebar or the list, with progress per feed. `r` checks the current view, `shift+r` checks all feeds. A pill shows how many new articles arrived, and feed rows show a spinner while checking and a warning with the error when a check fails.
- **Your own order:** a reorder mode on the feeds page moves folders and feeds up and down with arrows. The sidebar follows it.
- **Article list:** infinite scroll, with a load-more button as a per-device option. Rows are compact: meta line on top, title below. An icon switch under the header picks all, unread or starred.
- **Mark all as read** covers the whole feed or folder, including articles not loaded yet.
- **Reading comfort:** a font and text size popover in the article view. Dates can be relative ("3 hours ago") or absolute.
- **Small things:** keyboard hints in tooltips, collapsed sidebar folders stay collapsed, settings and shortcut dialogs with a fixed header.

## From Fusion

- Unread tracking, bookmarks, search, and Google Reader-style keyboard shortcuts (`?` lists them)
- RSS/Atom parsing, feed auto-discovery, and groups
- Fever API for third-party clients (Reeder, Unread, FeedMe): see [`docs/fever-api.md`](./docs/fever-api.md)
- Responsive web UI with PWA support
- Single binary or Docker deployment
- i18n: English, Chinese, German, French, Spanish, Russian, Portuguese, Swedish
- No AI features by design

## Installation

TBD: refusion has no releases or Docker images yet. To build it yourself, see [Development](#development).

## Configuration

Settings are environment variables, listed with their defaults in [`.env.example`](./.env.example). They keep upstream's `FUSION_` prefix. Most setups only need `FUSION_PASSWORD`.

## Documentation

Design notes and API conventions: [`docs/`](./docs/README.md).

## Development

- Go and Node.js versions are pinned in [`backend/go.mod`](./backend/go.mod) and [`frontend/package.json`](./frontend/package.json); you also need pnpm.
- Build and test commands are in [`scripts.sh`](./scripts.sh), e.g. `./scripts.sh build`. Local setup: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Credits

- [Fusion](https://github.com/0x2E/fusion) by Rook1e, which refusion is forked from
- Feed parsing by [gofeed](https://github.com/mmcdole/gofeed)

> [!NOTE]
> **Built with AI help.** Most of what refusion adds to Fusion was written by coding agents, then reviewed, tried in the app and kept or thrown out by me. It's a personal tool shaped around how I read, not a polished product. The reader itself stays AI-free: no summaries, no recommendations, just your feeds.
