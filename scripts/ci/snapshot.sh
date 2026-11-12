#!/usr/bin/env bash
# Stores / restores the generated data (public/data) as one compressed file
# attached to the "data-snapshot" release. A release asset is replaced in
# place, so frequent large snapshots do not grow the git repository.
#
#   scripts/ci/snapshot.sh restore   # public/data <- release asset (or the old `data` branch)
#   scripts/ci/snapshot.sh save      # public/data -> release asset
#
# Uses the GitHub CLI; GH_TOKEN must be set in CI.
set -euo pipefail

TAG="data-snapshot"
ASSET="data.tar.gz"
DIR="public/data"
TMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"

case "${1:-}" in
  restore)
    rm -rf "$DIR" && mkdir -p "$DIR"
    if gh release download "$TAG" --pattern "$ASSET" --dir "$TMP" --clobber 2>/dev/null; then
      tar -xzf "$TMP/$ASSET" -C "$DIR"
      echo "restored from release: $(ls "$DIR/champions" | wc -l) champion files"
    elif git fetch --depth=1 origin data 2>/dev/null; then
      # snapshots made before the release existed
      git archive FETCH_HEAD | tar -x -C "$DIR"
      echo "restored from data branch: $(ls "$DIR/champions" | wc -l) champion files"
    else
      echo "no snapshot yet"
    fi
    ;;
  save)
    test -f "$DIR/meta.json" || { echo "nothing to save: $DIR/meta.json is missing" >&2; exit 1; }
    tar -czf "$TMP/$ASSET" -C "$DIR" .
    if ! gh release view "$TAG" >/dev/null 2>&1; then
      gh release create "$TAG" --title "Data snapshot" --notes "Generated data used to build the site. Replaced by every data refresh; not a software release." --latest=false
    fi
    gh release upload "$TAG" "$TMP/$ASSET" --clobber
    echo "saved snapshot: $(du -h "$TMP/$ASSET" | cut -f1)"
    ;;
  *)
    echo "usage: $0 restore|save" >&2
    exit 2
    ;;
esac
