#!/bin/bash
# Initialize on-server file storage for FashionERP (product images, receipts, logos).
# Run on the VPS: bash scripts/setup_storage.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STORAGE_DIR="${STORAGE_DIR:-$ROOT/storage}"
OWNER_UID="${STORAGE_OWNER_UID:-1001}"
OWNER_GID="${STORAGE_OWNER_GID:-1001}"

echo "==> Storage directory: $STORAGE_DIR"

mkdir -p "$STORAGE_DIR"/{.ssl-pending,products,receipts,general,brands}

# Migrate from old Docker named volume if present and storage is empty
OLD_VOL="/var/lib/docker/volumes/fashionerp_uploads_data/_data"
if [[ -d "$OLD_VOL" ]] && [[ -z "$(ls -A "$STORAGE_DIR" 2>/dev/null | grep -v '^\.gitkeep$' || true)" ]]; then
  echo "==> Migrating files from Docker volume $OLD_VOL ..."
  cp -a "$OLD_VOL"/. "$STORAGE_DIR"/
fi

chown -R "$OWNER_UID:$OWNER_GID" "$STORAGE_DIR"
chmod -R u+rwX,g+rwX "$STORAGE_DIR"

echo "==> Storage ready"
du -sh "$STORAGE_DIR" 2>/dev/null || true
ls -la "$STORAGE_DIR"
