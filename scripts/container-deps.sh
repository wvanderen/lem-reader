#!/usr/bin/env bash
# Container-only dependency initialization. The lock lives in a SEPARATE
# persistent volume: npm ci removes everything in the dependency directory.
# Usage: bash scripts/container-deps.sh DEPS_DIR LOCK_DIR OWNER REBUILD
# OWNER is empty for rootless Docker, otherwise the caller's uid:gid.
set -euo pipefail

deps_dir=$1
lock_dir=$2
owner=$3
rebuild=$4
mkdir -p "$deps_dir" "$lock_dir"
(
  flock -x 9
  # Invalidate under the same lock as installation, including forced rebuilds.
  if [[ "$rebuild" == "1" ]]; then
    rm -f "$deps_dir/.deps-ready"
  fi
  if [[ ! -f "$deps_dir/.deps-ready" ]]; then
    (cd "$(dirname "$deps_dir")" && npm ci)
    if [[ -n "$owner" ]]; then
      chown -R "$owner" "$deps_dir"
    fi
    touch "$deps_dir/.deps-ready"
  fi
) 9>"$lock_dir/.init.lock"
