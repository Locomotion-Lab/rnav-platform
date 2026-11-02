#!/bin/bash
# No unencrypted DB/files leave the Mac. Configured receiver key and SSH host are required.
set -euo pipefail
bundle="${1:?bundle directory required}"
recipient="${AGE_RECIPIENT:?set independently verified age recipient}"
host="${RNAV_BACKUP_HOST:?set reviewed offsite SSH alias}"
case "$host" in rnav-backup) ;; *) echo 'Only reviewed rnav-backup alias allowed' >&2; exit 1;; esac
if command -v age >/dev/null; then age_cmd=(age); else age_cmd=(docker run --rm -i --network none --entrypoint age rnav-dbtools:phase3); fi
if [[ "${2:-}" != --apply ]]; then echo 'Dry run: would encrypt bundle and upload to configured offsite backup receiver';exit 0;fi
archive="$bundle.age"
[[ ! -e "$archive" ]] || { echo 'Refusing overwrite' >&2;exit 1; }
umask 077
tar -C "$bundle" -cf - . | "${age_cmd[@]}" -r "$recipient" > "$archive"
shasum -a 256 "$archive" > "$archive.sha256"
rsync --archive --protect-args -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes' "$archive" "$archive.sha256" "$host:incoming/"
echo 'Encrypted copy transferred; independently verify remote checksum and perform scheduled isolated restore'
