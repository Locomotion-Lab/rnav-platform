#!/bin/bash
set -euo pipefail
package="${1:?approved bundle directory required}"
host="${2:?SSH publication host alias required}"
case "$host" in rnav-publication) ;; *) echo 'Use reviewed rnav-publication alias only' >&2; exit 1;; esac
node scripts/phase3/stage-publication.mjs "$package" >/dev/null
if [[ "${3:-}" != --apply ]]; then echo 'Dry run: would transfer only signed, manifest-listed files to /srv/rnav-incoming/';exit 0;fi
tempdir="$(mktemp -d)"
trap 'rm -rf "$tempdir"' EXIT
id="$(node scripts/phase3/stage-publication.mjs "$package" "$tempdir")"
rsync --archive --protect-args --chmod=D750,F640 --partial --delay-updates -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes' "$tempdir/$id" "$host:./"
