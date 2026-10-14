# Releasing

How to cut a release, and the decisions behind it.

## Cut a release

```shell
git tag vX.Y.Z          # on main, after its checks pass
git push origin vX.Y.Z
```

`.github/workflows/release.yml` tests, builds the zips and opens a draft release with them and `checksums.txt`. Read the draft, then publish it.

**Version.** Before 1.0: patch (`0.1.x`) for fixes only; minor (`0.x.0`) for new features or anything a user must act on when upgrading.

**Notes.** The draft's generated notes are empty (no PRs). Before publishing, write them from `git log vPREV..vX.Y.Z`: what users notice, not code, under **Fixes**, **Changes** and **Upgrade notes** (only sections with content; Upgrade notes only when someone must act). They live only on the GitHub release, no CHANGELOG. Put them on the draft and show the user; publish on their OK:

```shell
gh release edit vX.Y.Z -R nicnic-cc/refusion --notes-file <file>
``` Publishing triggers `docker.yml`, which pushes `ghcr.io/nicnic-cc/refusion` with the semver tag (`X.Y.Z`) and `latest`. Images exist only for published releases; there is no `:main` image.

## Decisions (2026-10-10 and 2026-10-13)

- Plain semver from v0.1.0.
- GHCR only, no Docker Hub.
- Binary, zip and image are named `refusion`. The `FUSION_` env vars, `cmd/fusion` and `/data/fusion.db` stay, so a Fusion volume works as it is.
- Images come only from published releases.
- The image must not run as root: the entrypoint hands `/data` to uid 1000, then drops root.

## Upstream tags stay out

`remote.upstream.tagOpt` is `--no-tags`. The app's shown version comes from `git describe --tags` in `frontend/vite.config.ts`, so upstream's tags would put Fusion version numbers in the app. Restore them with:

```shell
git config --unset remote.upstream.tagOpt && git fetch upstream --tags
```

## Gotchas

- **Actions on a fork.** The GitHub repo is a fork, and GitHub keeps Actions off on forks until someone clicks "enable" in the repo's Actions tab, even though the API reports Actions enabled. A tag pushed before that never runs. After enabling, delete and re-push the remote tag:

  ```shell
  git push origin :refs/tags/vX.Y.Z
  git push origin vX.Y.Z
  ```

- **GHCR visibility.** A new package may start private. After the first image push, check its visibility on the package settings page and make it public.
- **`gh` defaults to upstream** in this clone. Pass `-R nicnic-cc/refusion`.
