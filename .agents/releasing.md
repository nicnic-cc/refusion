# Releasing

How to cut a release, and the decisions behind it.

## Cut a release

```shell
git tag vX.Y.Z          # on main, after its checks pass
git push origin vX.Y.Z
```

`.github/workflows/release.yml` tests, builds the zips and opens a draft release with them and `checksums.txt`. Read the draft, then publish it. Publishing triggers `docker.yml`, which pushes `ghcr.io/nicnic-cc/refusion` with the semver tag (`X.Y.Z`) and `latest`. Images exist only for published releases; there is no `:main` image.

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
