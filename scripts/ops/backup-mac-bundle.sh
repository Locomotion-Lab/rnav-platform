#!/usr/bin/env bash
# Consistent local backup with API/schedulers stopped; refuses online backup.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
project="${RNAV_COMPOSE_PROJECT:-rnav-mac-dev}"
compose=(docker compose -p "$project" --env-file .env.mac -f compose.mac.yaml)
if "${compose[@]}" ps --status running --services | rg -q '^(api|scholarly-sync|migrate)$'; then
  echo 'Stop local writers and schedules before the joint DB/file backup.' >&2
  exit 1
fi
root="${1:-backups/mac-bundles}"
mkdir -p "$root"
destination="$root/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir "$destination"
"${compose[@]}" exec -T db pg_dump -U rnav -d rnav_platform -Fc > "$destination/database.dump"
"${compose[@]}" exec -T db pg_restore --list < "$destination/database.dump" > /dev/null
"${compose[@]}" run --no-deps --rm -T api tar -C /data -cf - private-media publications > "$destination/files.tar"
tar -tf "$destination/files.tar" > /dev/null
(cd "$destination" && shasum -a 256 database.dump files.tar > SHA256SUMS)
echo 'Local database/file bundle verified. Encrypt and copy offsite before calling it a disaster-recovery backup.'
printf 'Backup directory: %s\n' "$destination"
