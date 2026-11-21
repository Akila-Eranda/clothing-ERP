#!/usr/bin/env bash
# HexaOne restore test — proves a backup can actually be restored. Run weekly (and after any
# backup change). Restores into a THROWAWAY database, runs sanity queries, then drops it.
# It never touches the live database.
#
#   sudo /opt/fashionerp/scripts/backup/hexaone-db-restore-test.sh [path/to/backup.dump[.gpg]]
#
# Without an argument the newest backup in BACKUP_DIR is used. Same env file and modes as
# hexaone-db-backup.sh. Encrypted backups need the private key in the local gpg keyring.
set -Eeuo pipefail
umask 077

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/hexaone/backup.env}"
if [[ -f "$BACKUP_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$BACKUP_ENV_FILE"
fi
BACKUP_MODE="${BACKUP_MODE:-docker}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/hexaone}"
PG_CONTAINER="${PG_CONTAINER:-fashionerp_db}"
BACKUP_LOG="${BACKUP_LOG:-$BACKUP_DIR/backup.log}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "restore-test: $*" | tee -a "$BACKUP_LOG" >&2; }
fail() { log "ERROR: $*"; exit 1; }

FILE="${1:-$(ls -1t "$BACKUP_DIR"/hexaone_*.dump "$BACKUP_DIR"/hexaone_*.dump.gpg 2>/dev/null | head -1 || true)}"
[[ -n "$FILE" && -f "$FILE" ]] || fail "no backup file found"

# 1. Checksum must match what the backup run recorded.
if [[ -f "$FILE.sha256" ]]; then
  ( cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" >/dev/null ) || fail "checksum mismatch for $FILE"
else
  fail "missing checksum file $FILE.sha256"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DUMP="$FILE"
if [[ "$FILE" == *.gpg ]]; then
  gpg --batch --quiet --decrypt --output "$WORK/restore.dump" "$FILE"
  DUMP="$WORK/restore.dump"
fi

TEST_DB="hexaone_restore_test_$(date -u +%Y%m%d%H%M%S)"
log "restoring $(basename "$FILE") into $TEST_DB"

case "$BACKUP_MODE" in
  docker)
    DB_USER="$(docker exec "$PG_CONTAINER" sh -c 'printf %s "${POSTGRES_USER:-postgres}"')"
    psql_q()  { docker exec -i "$PG_CONTAINER" psql -U "$DB_USER" -d "$1" -v ON_ERROR_STOP=1 -At -c "$2"; }
    restore() { docker exec -i "$PG_CONTAINER" pg_restore -U "$DB_USER" -d "$TEST_DB" --no-owner --no-privileges --exit-on-error < "$DUMP"; }
    ADMIN_DB=postgres
    ;;
  direct)
    export PGHOST PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
    psql_q()  { psql -d "$1" -v ON_ERROR_STOP=1 -At -c "$2"; }
    restore() { pg_restore -d "$TEST_DB" --no-owner --no-privileges --exit-on-error < "$DUMP"; }
    ADMIN_DB="${PGADMIN_DB:-postgres}"
    ;;
  *) fail "BACKUP_MODE must be docker or direct" ;;
esac

cleanup_db() { psql_q "$ADMIN_DB" "DROP DATABASE IF EXISTS \"$TEST_DB\"" >/dev/null 2>&1 || true; }
trap 'cleanup_db; rm -rf "$WORK"' EXIT

psql_q "$ADMIN_DB" "CREATE DATABASE \"$TEST_DB\"" >/dev/null
START=$(date +%s)
restore || fail "pg_restore failed"

# 2. Sanity checks on the restored copy.
TENANTS=$(psql_q "$TEST_DB" "SELECT count(*) FROM tenants")
USERS=$(psql_q "$TEST_DB" "SELECT count(*) FROM users")
SALES=$(psql_q "$TEST_DB" "SELECT count(*) FROM sales")
# Each journal line is one-sided (debitAccountId OR creditAccountId + amount).
UNBALANCED=$(psql_q "$TEST_DB" "SELECT count(*) FROM (SELECT \"journalEntryId\" FROM journal_lines GROUP BY 1 HAVING abs(sum(CASE WHEN \"debitAccountId\" IS NOT NULL THEN amount ELSE 0 END) - sum(CASE WHEN \"creditAccountId\" IS NOT NULL THEN amount ELSE 0 END)) > 0.01) x")
[[ "$TENANTS" -gt 0 ]] || fail "restored database has no tenants"
[[ "$USERS" -gt 0 ]] || fail "restored database has no users"

log "ok: $(basename "$FILE") restored in $(( $(date +%s) - START ))s — tenants=$TENANTS users=$USERS sales=$SALES unbalanced_journals=$UNBALANCED"
echo "RESTORE TEST PASSED: tenants=$TENANTS users=$USERS sales=$SALES unbalanced_journals=$UNBALANCED"
