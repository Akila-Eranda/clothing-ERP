#!/bin/bash
# FashionERP — VPS Deploy Script
# Run this on: ssh root@49.12.207.238
set -e

echo "==> Pulling latest code..."
cd /opt/fashionerp
git pull origin main

echo "==> SSL Certificates (certbot)..."
certbot certonly --nginx \
  -d shop.hexalyte.com \
  -d shop.clothing.api.hexalyte.com \
  -d admin3.hexalyte.com \
  --non-interactive --agree-tos -m your@email.com || echo "SSL already exists, skipping"

# Create ssl folder structure for nginx
mkdir -p nginx/ssl/shop.hexalyte.com
mkdir -p nginx/ssl/shop.clothing.api.hexalyte.com
mkdir -p nginx/ssl/admin3.hexalyte.com

cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem       nginx/ssl/shop.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem          nginx/ssl/shop.hexalyte.com/
cp /etc/letsencrypt/live/shop.clothing.api.hexalyte.com/fullchain.pem nginx/ssl/shop.clothing.api.hexalyte.com/
cp /etc/letsencrypt/live/shop.clothing.api.hexalyte.com/privkey.pem   nginx/ssl/shop.clothing.api.hexalyte.com/
cp /etc/letsencrypt/live/admin3.hexalyte.com/fullchain.pem      nginx/ssl/admin3.hexalyte.com/
cp /etc/letsencrypt/live/admin3.hexalyte.com/privkey.pem         nginx/ssl/admin3.hexalyte.com/

echo "==> Copying env..."
# F-12: the environment file lives OUTSIDE the git checkout (it must never be tracked).
# Fallback to the old in-repo copy only until Ops has moved it; stop before touching containers otherwise.
ENV_SOURCE="${HEXA_ENV_FILE:-/opt/fashionerp-config/.env.production}"
if [ -f "$ENV_SOURCE" ]; then
  cp "$ENV_SOURCE" .env
elif [ -f .env.production ]; then
  echo "WARNING: using the in-repo .env.production; move it to $ENV_SOURCE (F-12)"
  cp .env.production .env
else
  echo "ERROR: no environment file at $ENV_SOURCE (or HEXA_ENV_FILE). Nothing was stopped or changed."
  exit 1
fi

echo "==> Building + Starting containers..."
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d

echo "==> Running DB migrations..."
sleep 10
docker compose exec api npx prisma migrate deploy
echo "==> Seed skipped: not part of deployments (initial setup only: docs/initial-setup-and-seeding.md)"

echo ""
echo "✅ Deployment complete!"
echo "   Frontend : https://shop.hexalyte.com"
echo "   API      : https://shop.clothing.api.hexalyte.com/api/docs"
echo "   Admin    : https://admin3.hexalyte.com/admin"
