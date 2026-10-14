#!/bin/sh
set -eu

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
      if [ "$dir" != / ]; then chown fusion:fusion "$dir"; fi
      for f in "$db" "$db-wal" "$db-shm"; do
        if [ -e "$f" ]; then chown fusion:fusion "$f"; fi
      done
      ;;
  esac
  exec su-exec fusion "$@"
fi
exec "$@"
