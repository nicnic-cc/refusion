# Install

refusion is one program and one SQLite file. Run it as a Docker image or as a plain binary. Every setting is an environment variable, listed in [`.env.example`](../.env.example); `FUSION_PASSWORD` is the only one you must set, and the app refuses to start without it.

## Docker

The image is `ghcr.io/nicnic-cc/refusion` for amd64 and arm64. `latest` is the newest release; to hold back upgrades, use a release's version tag instead (`0.1.0` for release v0.1.0).

```shell
docker run -d --name refusion --restart unless-stopped \
  -p 8080:8080 \
  -v refusion-data:/data \
  -e FUSION_PASSWORD=change-me \
  ghcr.io/nicnic-cc/refusion:latest
```

Open <http://localhost:8080> and sign in with the password. The same thing as a `compose.yaml`:

```yaml
services:
  refusion:
    image: ghcr.io/nicnic-cc/refusion:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      FUSION_PASSWORD: change-me
    volumes:
      - refusion-data:/data

volumes:
  refusion-data:
```

```shell
docker compose up -d
```

The database is `/data/fusion.db` in the container (the `fusion` name stays so a Fusion volume works as it is). Keep `/data` on a volume, or the database goes when the container is removed.

The app runs as user 1000, not root. A named volume needs nothing. If you bind-mount a folder (`-v /srv/refusion:/data`), the first start changes that folder's owner to 1000. With `FUSION_DB_PATH` outside `/data`, it changes only the database folder and files, and where root may not change owners (NFS with root_squash) it prints a warning and starts anyway. To run with `--cap-drop ALL`, add `--user 1000:1000`: the switch from root to user 1000 needs the SETUID and SETGID capabilities. With `--user` the start skips that owner change, so the volume or folder must already be owned by 1000.

## Binary

Release zips for macOS, Linux and Windows (amd64 and arm64) are on the [releases page](https://github.com/nicnic-cc/refusion/releases). Each holds the `refusion` program (`refusion.exe` on Windows), the license and the README. Download the zip for your platform and `checksums.txt`, then check the zip. On Linux:

```shell
curl -LO https://github.com/nicnic-cc/refusion/releases/latest/download/refusion_linux_amd64.zip
curl -LO https://github.com/nicnic-cc/refusion/releases/latest/download/checksums.txt
sha256sum -c --ignore-missing checksums.txt
```

On macOS (here Apple silicon; use `darwin_amd64` for Intel), the same with `shasum`:

```shell
curl -LO https://github.com/nicnic-cc/refusion/releases/latest/download/refusion_darwin_arm64.zip
curl -LO https://github.com/nicnic-cc/refusion/releases/latest/download/checksums.txt
shasum -a 256 -c --ignore-missing checksums.txt
```

The check prints `OK` for the zip. Then unzip and run it from the folder where you want the data:

```shell
unzip refusion_darwin_arm64.zip
FUSION_PASSWORD=change-me ./refusion
```

It listens on port 8080 (`FUSION_PORT`) and keeps the database as `fusion.db`, with `-wal` and `-shm` files beside it, in the folder you started it from (`FUSION_DB_PATH` moves it). It does not run in the background by itself; use systemd, launchd or similar for that. On Windows, set the variables in your shell and run `refusion.exe`.

macOS blocks a program downloaded in a browser: the download is marked as quarantined and the program is not notarized, so it is killed or refused on start. Clear the mark once, on the unzipped program:

```shell
xattr -d com.apple.quarantine refusion
```

A download with `curl`, as above, is not marked and needs no such step.

## Deploying

Run refusion behind a reverse proxy that serves HTTPS. Without it your password and session cookie cross the network in clear text, and browsers only offer to install the PWA on HTTPS pages. The proxy must send `X-Forwarded-Proto`; refusion uses it to mark the session cookie `Secure`. Caddy does this by default and gets the certificate itself:

```
reader.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

Also set `FUSION_TRUSTED_PROXIES` to the address (or range) the proxy connects from. Without it refusion sees every request as coming from the proxy, so the login limiter counts all clients together: ten wrong passwords from anyone lock everyone out for five minutes. The limiter covers failed password logins and failed Fever API keys. To find the address, look at `client_ip` in the app's log for a request through the proxy. In Docker it is usually the bridge gateway, not `127.0.0.1`.

```shell
docker run -d --name refusion --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v refusion-data:/data \
  -e FUSION_PASSWORD=change-me \
  -e FUSION_TRUSTED_PROXIES=172.16.0.0/12 \
  ghcr.io/nicnic-cc/refusion:latest
```

Binding the port to `127.0.0.1` keeps the plain HTTP port off the network, so only the proxy reaches it.

### Fly.io

[`fly.toml`](../fly.toml) runs the image on [Fly.io](https://docs.fly.io/) with a volume on `/data`. Replace the placeholders `{APP_NAME}`, `{REGION}` and `{YOUR_PASSWORD}`, keep the filled file out of git, then launch with it (see [`fly launch`](https://docs.fly.io/flyctl/launch)):

```shell
fly launch --copy-config
```

## Backup and upgrade

The data is the `fusion.db` file. While refusion runs, SQLite also keeps `fusion.db-wal` and `fusion.db-shm`; a copy of `fusion.db` alone can miss recent changes. Either:

- Stop the app, then copy `fusion.db` and any `-wal` and `-shm` files beside it. A clean stop leaves just `fusion.db`. For a Docker named volume:

  ```shell
  docker stop refusion
  docker run --rm -v refusion-data:/data -v "$PWD":/backup alpine tar czf /backup/refusion-data.tgz -C /data .
  docker start refusion
  ```

- Or back up while it runs, with the `sqlite3` command line tool:

  ```shell
  sqlite3 /path/to/fusion.db ".backup backup.db"
  ```

To restore, stop the app and put the file back as `fusion.db`.

Upgrading replaces the program, and the new version migrates the database when it starts. Take a backup first, since migrations are not reversed.

- **Docker:** pull the new image and recreate the container on the same volume.

  ```shell
  docker pull ghcr.io/nicnic-cc/refusion:latest
  docker stop refusion
  docker rm refusion
  ```

  Then run the same `docker run` command again. With compose: `docker compose pull && docker compose up -d`.
- **Binary:** stop it, replace the `refusion` program with the one from the new zip, start it in the same folder.

## Moving from Fusion

Back up your Fusion database first, as above. refusion opens a Fusion database as it is: point it at the same `fusion.db` (or mount the same Docker volume at `/data`) and start it. The migrations run on that first start and add what refusion needs. If Fusion's container ran as root, the first start hands the files to the app's user.

Going back is not supported. Fusion can still open a database that refusion has migrated, but it ignores everything refusion added (filters, folder order, per-feed views, web page CSS). To go back, restore the backup.

A database that Fusion created keeps one quirk: after you delete a feed, new articles can reuse the deleted articles' ids. As a result, "Mark all as read" can also mark an article that arrived after you loaded the list, if it took a deleted article's id. Databases that refusion created do not reuse ids.
