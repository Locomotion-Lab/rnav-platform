#!/bin/bash
set -euo pipefail
export PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
cd /Users/aaron/Projects/rnav-platform
export RNAV_SECRETS_DIR=/Users/aaron/.config/rnav/secrets
set -a
# This is an operator-owned local configuration file; never source a transferred/untrusted env file.
source /Users/aaron/.config/rnav/production.env
set +a
compose=(docker compose -f deploy/production/compose.mac.yaml)
lock=/Users/aaron/.config/rnav/backup.lock
mkdir "$lock" || { echo 'Another backup or stale lock requires inspection' >&2;exit 1; }
was_running=false
if "${compose[@]}" ps --status running --services | /usr/bin/grep -qx api; then was_running=true;fi
finish(){ if "$was_running";then "${compose[@]}" up --no-build -d --wait api;fi;rmdir "$lock"; }
trap finish EXIT
"${compose[@]}" stop api
backup="/Users/aaron/Projects/rnav-platform/backups/nightly/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$(dirname "$backup")"
python3 scripts/phase3/bundle.py backup --project rnav-production --directory "$backup" --apply
if "$was_running"; then "${compose[@]}" up --no-build -d --wait api; was_running=false; fi
bash scripts/phase3/offsite.sh "$backup" --apply
# No default retention deletion. Retain 7 daily + 4 weekly after independently verified offsite copies.
