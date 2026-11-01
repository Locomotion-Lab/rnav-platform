#!/usr/bin/env bash
# Local Compose database only. Never connects to the cloud database.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
destination="${1:-backups/mac}"
mkdir -p "$destination"
destination="$(cd "$destination" && pwd)"
archive="$destination/rnav-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
partial="$archive.partial"
trap 'rm -f "$partial"' EXIT
compose=(docker compose --env-file .env.mac -f compose.mac.yaml)
"${compose[@]}" exec -T db pg_dump -U rnav -d rnav_platform --format=custom > "$partial"
# Validate the archive using the matching PostgreSQL toolchain before publishing it.
"${compose[@]}" exec -T db pg_restore --list < "$partial" > /dev/null
mv "$partial" "$archive"
shasum -a 256 "$archive" > "$archive.sha256"
printf 'Verified backup: %s\n' "$archive"
