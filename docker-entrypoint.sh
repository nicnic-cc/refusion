#!/bin/sh
set -eu

# Older volumes hold root-owned files; hand /data to fusion, then drop root.
if [ "$(id -u)" = "0" ]; then
  if [ -n "$(find /data ! -user fusion -print -quit)" ]; then
    chown -R fusion:fusion /data
  fi
  exec su-exec fusion "$@"
fi
exec "$@"
