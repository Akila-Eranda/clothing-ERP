#!/bin/bash
# Process pending SSL renewal markers written by API (shared uploads volume).
# Add to cron: */3 * * * * root /opt/fashionerp/scripts/process_ssl_pending.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PENDING_DIR="${SSL_PENDING_DIR:-/opt/fashionerp/storage/.ssl-pending}"

if [[ ! -d "$PENDING_DIR" ]]; then
  exit 0
fi

shopt -s nullglob
files=("$PENDING_DIR"/*.pending)
if [[ ${#files[@]} -eq 0 ]]; then
  exit 0
fi

echo "[ssl-pending] Found ${#files[@]} pending tenant(s) — renewing SSL..."
if ! bash scripts/renew_tenant_ssl.sh; then
  echo "[ssl-pending] Renewal failed — keeping pending files for retry"
  exit 1
fi

for f in "${files[@]}"; do
  rm -f "$f"
done

echo "[ssl-pending] Done"
