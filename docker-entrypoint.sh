#!/bin/sh
set -eu

# chown only what fusion does not own yet; a refusal (NFS root_squash, read-only
# mount) warns and startup goes on, since fusion may still be able to write.
own() {
  if [ -n "$(find "$1" -maxdepth 0 ! -user fusion)" ]; then
    chown fusion:fusion "$1" || echo "docker-entrypoint: cannot chown $1, continuing" >&2
  fi
}

# Older volumes hold root-owned files; hand /data to fusion, then drop root.
if [ "$(id -u)" = "0" ]; then
  if [ -n "$(find /data ! -user fusion -print -quit)" ]; then
    chown -R fusion:fusion /data
  fi
  # A DB outside /data (same lookup as config.Load): hand over only its folder
  # and files, never a whole mounted tree.
  db="${FUSION_DB_PATH:-${DB:-fusion.db}}"
  case "$db" in /*) ;; *) db="$PWD/$db" ;; esac
  case "$db" in
    /data/*) ;;
    *)
      dir="$(dirname "$db")"
      if [ "$dir" != / ]; then own "$dir"; fi
      for f in "$db" "$db-wal" "$db-shm"; do
        if [ -e "$f" ]; then own "$f"; fi
      done
      ;;
  esac
  exec su-exec fusion "$@"
fi
exec "$@"
