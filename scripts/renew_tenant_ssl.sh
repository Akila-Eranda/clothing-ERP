#!/bin/bash
# Re-issue SSL cert to include all tenant *.shop.hexalyte.com subdomains.
# Run on VPS after adding a new tenant: bash scripts/renew_tenant_ssl.sh
set -e
cd "$(dirname "$0")/.."

EMAIL="${CERTBOT_EMAIL:-admin@hexalyte.com}"

SUBDOMAINS=$(docker compose exec -T postgres psql -U fashionerp -d fashionerp -tAc \
  "SELECT subdomain FROM tenants WHERE subdomain NOT IN ('platform') ORDER BY subdomain" | tr -d ' ' | grep -v '^$' || true)

DOMAIN_ARGS="-d shop.hexalyte.com -d shop.clothing.api.hexalyte.com -d admin3.hexalyte.com"
for s in $SUBDOMAINS; do
  DOMAIN_ARGS="$DOMAIN_ARGS -d ${s}.shop.hexalyte.com"
done

echo "Domains: $DOMAIN_ARGS"
docker compose stop nginx
certbot certonly --standalone $DOMAIN_ARGS \
  --non-interactive --agree-tos -m "$EMAIL" --expand --force-renewal

for dir in shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com wildcard.shop.hexalyte.com; do
  mkdir -p "nginx/ssl/$dir"
  cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem "nginx/ssl/$dir/"
  cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem "nginx/ssl/$dir/"
done

docker compose up -d nginx
echo "SSL renewed for tenants: $SUBDOMAINS"
