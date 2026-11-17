#!/usr/bin/env bash
# HexaOne PostgreSQL backup — custom-format dump + checksum + catalog verification + retention.
#
#   sudo /opt/fashionerp/scripts/backup/hexaone-db-backup.sh
#
# Configuration comes from an env file OUTSIDE the repository (never commit it):
#   BACKUP_ENV_FILE (default /etc/hexaone/backup.env) — see backup.env.example.
#
# Modes
#   BACKUP_MODE=docker  (default) pg_dump runs inside the PostgreSQL container ($PG_CONTAINER);
#                       credentials are the container's own POSTGRES_USER / POSTGRES_DB.
#   BACKUP_MODE=direct  pg_dump runs on this host against PGHOST/PGPORT/PGUSER/PGDATABASE;
#                       password via PGPASSFILE (~/.pgpass, chmod 600) — never on the command line.
#
# Output (BACKUP_DIR, default /var/backups/hexaone):
#   hexaone_<db>_<UTC timestamp>.dump(.gpg)   pg_dump -Fc
#   ….sha256                                  checksum of the stored file
#   ….json                                    metadata (size, tables, duration, host)
#
# Exit code is non-zero on ANY failure so cron / systemd can alert.
set -Eeuo pipefail
umask 077

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/hexaone/backup.env}"
if [[ -f "$BACKUP_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$BACKUP_ENV_FILE"
fi

BACKUP_MODE="${BACKUP_MODE:-docker}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/hexaone}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_MIN_BYTES="${BACKUP_MIN_BYTES:-10240}"          # a real HexaOne dump is far larger
PG_CONTAINER="${PG_CONTAINER:-fashionerp_db}"
BACKUP_GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-}"      # optional: encrypt before storing / shipping
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"      # optional: e.g. "b2-hexaone:db-backups"
BACKUP_LOG="${BACKUP_LOG:-$BACKUP_DIR/backup.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/hexaone-db-backup.lock}"

mkdir -p "$BACKUP_DIR"
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$BACKUP_LOG" >&2; }
fail() { log "ERROR: $*"; exit 1; }
trap 'fail "backup aborted at line $LINENO"' ERR

# Single run at a time.
exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || fail "another backup is running ($LOCK_FILE)"
fi

# ── Resolve database name and dump/list commands for the chosen mode ─────────────
case "$BACKUP_MODE" in
  docker)
    command -v docker >/dev/null || fail "docker not found"
    docker inspect "$PG_CONTAINER" >/dev/null 2>&1 || fail "container $PG_CONTAINER not found"
    DB_NAME="$(docker exec "$PG_CONTAINER" sh -c 'printf %s "${POSTGRES_DB:-postgres}"')"
    DB_USER="$(docker exec "$PG_CONTAINER" sh -c 'printf %s "${POSTGRES_USER:-postgres}"')"
    run_dump()  { docker exec "$PG_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -Z 6 --no-owner --no-privileges; }
    run_list()  { docker exec -i "$PG_CONTAINER" pg_restore --list; }
    ;;
  direct)
    command -v pg_dump >/dev/null || fail "pg_dump not found"
    command -v pg_restore >/dev/null || fail "pg_restore not found"
    : "${PGHOST:?PGHOST required in direct mode}" "${PGDATABASE:?PGDATABASE required in direct mode}"
    export PGHOST PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" PGDATABASE
    DB_NAME="$PGDATABASE"
    run_dump()  { pg_dump -Fc -Z 6 --no-owner --no-privileges; }
    run_list()  { pg_restore --list; }
    ;;
  *) fail "BACKUP_MODE must be docker or direct (got '$BACKUP_MODE')" ;;
esac

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$BACKUP_DIR/hexaone_${DB_NAME}_${STAMP}"
DUMP="$BASE.dump"
PARTIAL="$DUMP.partial"
START=$(date +%s)

log "backup start: mode=$BACKUP_MODE db=$DB_NAME -> $DUMP"

# 1. Dump to a .partial file so a crash never leaves a file that looks complete.
run_dump > "$PARTIAL"
SIZE=$(wc -c < "$PARTIAL" | tr -d ' ')
[[ "$SIZE" -ge "$BACKUP_MIN_BYTES" ]] || fail "dump is only $SIZE bytes (< $BACKUP_MIN_BYTES) — refusing to keep it"

# 2. Verify the archive is readable and contains the core tables.
TOC="$(run_list < "$PARTIAL")" || fail "pg_restore --list could not read the dump"
TABLES=$(printf '%s\n' "$TOC" | grep -c ' TABLE DATA ' || true)
for t in tenants users sales journal_entries inventory; do
  # here-string, not a pipe: with pipefail, printf | grep -q fails on SIGPIPE when grep exits early on a match
  grep -q -F " TABLE DATA public $t " <<<"$TOC" || fail "dump is missing table data for '$t'"
done
mv "$PARTIAL" "$DUMP"

# 3. Optional encryption (recommended before anything leaves the server).
STORED="$DUMP"
if [[ -n "$BACKUP_GPG_RECIPIENT" ]]; then
  gpg --batch --yes --trust-model always --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$DUMP.gpg" "$DUMP"
  rm -f "$DUMP"
  STORED="$DUMP.gpg"
fi

# 4. Checksum + metadata.
( cd "$BACKUP_DIR" && sha256sum "$(basename "$STORED")" > "$(basename "$STORED").sha256" )
DURATION=$(( $(date +%s) - START ))
cat > "$BASE.json" <<JSON
{"database":"$DB_NAME","file":"$(basename "$STORED")","bytes":$SIZE,"tables_with_data":$TABLES,"encrypted":$([[ -n "$BACKUP_GPG_RECIPIENT" ]] && echo true || echo false),"started_utc":"$STAMP","duration_seconds":$DURATION,"host":"$(hostname)","mode":"$BACKUP_MODE"}
JSON
log "backup ok: $(basename "$STORED") bytes=$SIZE tables=$TABLES duration=${DURATION}s"

# 5. Optional off-site copy (credentials live in rclone's own config, not here).
if [[ -n "$BACKUP_RCLONE_REMOTE" ]]; then
  command -v rclone >/dev/null || fail "BACKUP_RCLONE_REMOTE set but rclone not installed"
  rclone copy "$STORED" "$BACKUP_RCLONE_REMOTE/" --immutable
  rclone copy "$STORED.sha256" "$BACKUP_RCLONE_REMOTE/"
  rclone copy "$BASE.json" "$BACKUP_RCLONE_REMOTE/"
  log "off-site copy ok: $BACKUP_RCLONE_REMOTE"
fi

# 6. Retention — only touches files this script created, never partial runs in progress.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'hexaone_*' \
  \( -name '*.dump' -o -name '*.dump.gpg' -o -name '*.sha256' -o -name '*.json' \) \
  -mtime +"$BACKUP_RETENTION_DAYS" -print -delete | sed 's/^/pruned /' | while read -r line; do log "$line"; done
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'hexaone_*.partial' -mmin +720 -delete

trap - ERR
exit 0
