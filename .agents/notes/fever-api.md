# Fever API Compatibility

refusion provides a Fever-compatible endpoint for third-party RSS clients such as Reeder, Unread, and FeedMe.

## Endpoint

- `POST /fever`
- `POST /fever/`
- `POST /fever.php`

Request body format is `application/x-www-form-urlencoded`.

## Authentication

Fever clients should send:

- `api=1`
- `api_key=<md5(username:password)>`

Username is configured by `FUSION_FEVER_USERNAME` (default: `fusion`).
Password is your refusion login password (`FUSION_PASSWORD`).
With OIDC and no password set, Fever is off: an empty password would
otherwise bypass OIDC.

Client setup for people, with the md5 commands and a curl login check:
[`docs/apps.md`](../../docs/apps.md).

## Implemented Fever Features

Read APIs:

- `groups=1` -> `groups`, `feeds_groups`
- `feeds=1` -> `feeds`
- `favicons=1` -> `favicons` (placeholder payload)
- `items=1` (+ `since_id`, `max_id`, `with_ids`) -> `items`
- `unread_item_ids=1` -> CSV item IDs
- `saved_item_ids=1` -> CSV item IDs

Write APIs:

- `mark=item&id=<id>&as=read|unread|saved|unsaved`
- `mark=feed&id=<id>&as=read&before=<unix_timestamp>`
- `mark=group&id=<id>&as=read&before=<unix_timestamp>`

## Notes

- Saved items map to refusion bookmarks.
- `links`, `sparks`, and `kindlings` are not implemented.
- This compatibility API is outside `/api`; it is separate from the `/api` conventions documented in `.agents/notes/api-conventions.md`.
