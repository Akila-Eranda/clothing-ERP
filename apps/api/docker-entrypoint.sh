#!/bin/sh
set -e

mkdir -p /app/uploads
chown -R nestjs:nodejs /app/uploads 2>/dev/null || true

cd /app
exec su -s /bin/sh nestjs -c 'exec node dist/main'
