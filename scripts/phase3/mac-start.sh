#!/bin/bash
set -euo pipefail
export PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
cd /Users/aaron/Projects/rnav-platform
export RNAV_SECRETS_DIR=/Users/aaron/.config/rnav/secrets
# launchd retries if the user-login Docker/OrbStack engine is not ready.
[[ ! -d /Users/aaron/.config/rnav/backup.lock ]] || exit 0
docker info >/dev/null
docker compose --env-file /Users/aaron/.config/rnav/production.env -f deploy/production/compose.mac.yaml up --no-build -d --wait api
