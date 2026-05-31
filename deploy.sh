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
cp .env.production .env

echo "==> Building + Starting containers..."
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d

echo "==> Running DB migrations + seed..."
sleep 10
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed || echo "Seed skipped (already seeded)"

echo ""
echo "✅ Deployment complete!"
echo "   Frontend : https://shop.hexalyte.com"
echo "   API      : https://shop.clothing.api.hexalyte.com/api/docs"
echo "   Admin    : https://admin3.hexalyte.com/admin"
