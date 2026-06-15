#!/bin/bash
# HTTP hook for API to trigger SSL renewal after tenant creation.
# Run on VPS: bash scripts/tenant_ssl_hook.sh
# Set TENANT_SSL_HOOK_URL=http://127.0.0.1:9091/ssl/renew in API .env
set -euo pipefail

PORT="${TENANT_SSL_HOOK_PORT:-9091}"
SECRET="${TENANT_SSL_HOOK_SECRET:-change-me-in-production}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/fashionerp}"

cd "$DEPLOY_DIR"

while true; do
  { echo -ne "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n"; echo '{"ok":true}'; } | \
  nc -l -p "$PORT" -q 1 | head -20 > /tmp/ssl_hook_req.txt || true

  if grep -q "POST" /tmp/ssl_hook_req.txt 2>/dev/null; then
    if ! grep -qi "X-SSL-Hook-Secret: ${SECRET}" /tmp/ssl_hook_req.txt 2>/dev/null; then
      echo "[ssl-hook] rejected — bad secret"
      continue
    fi
    echo "[ssl-hook] SSL renew triggered at $(date -Is)"
    bash scripts/renew_tenant_ssl.sh >> /var/log/fashionerp-ssl-renew.log 2>&1 &
  fi
done
