#!/bin/sh
set -e
# Container runs as uid 1001 (nestjs). Uploads volume is mounted at /app/uploads.
mkdir -p /app/uploads 2>/dev/null || true
cd /app
exec node dist/main
