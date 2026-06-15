#!/bin/bash
# Re-issue SSL cert for all tenant *.shop.hexalyte.com subdomains.
# Prefers Cloudflare DNS-01 wildcard when credentials exist; else HTTP standalone expand.
set -e
cd "$(dirname "$0")/.."

LOCK_FILE="${SSL_RENEW_LOCK:-/var/lock/fashionerp-ssl-renew.lock}"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "==> Another SSL renewal is already running — skipping"
  exit 0
fi

EMAIL="${CERTBOT_EMAIL:-admin@hexalyte.com}"
CF_INI="${CLOUDFLARE_CREDENTIALS:-/opt/fashionerp/nginx/ssl/cloudflare.ini}"

copy_certs() {
  local cert_dir="${1:-/etc/letsencrypt/live/shop.hexalyte.com}"
  for dir in shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com wildcard.shop.hexalyte.com; do
    mkdir -p "nginx/ssl/$dir"
    cp "$cert_dir/fullchain.pem" "nginx/ssl/$dir/"
    cp "$cert_dir/privkey.pem" "nginx/ssl/$dir/"
  done
}

echo "==> Stopping nginx for certbot..."
docker compose stop nginx || true

if [[ -f "$CF_INI" ]]; then
  echo "==> Issuing wildcard cert via Cloudflare DNS-01..."
  certbot certonly --dns-cloudflare \
    --dns-cloudflare-credentials "$CF_INI" \
    -d "*.shop.hexalyte.com" \
    -d shop.hexalyte.com \
    -d shop.clothing.api.hexalyte.com \
    -d admin3.hexalyte.com \
    --non-interactive --agree-tos -m "$EMAIL" \
    --cert-name shop.hexalyte.com \
    --expand --force-renewal
  copy_certs "/etc/letsencrypt/live/shop.hexalyte.com"
else
  echo "==> Cloudflare credentials not found — expanding HTTP cert with all tenant SANs..."
  SUBDOMAINS=$(docker compose exec -T postgres psql -U fashionerp -d fashionerp -tAc \
    "SELECT subdomain FROM tenants WHERE subdomain NOT IN ('platform', '__platform_config__') AND subdomain ~ '^[a-z0-9-]+$' ORDER BY subdomain" | tr -d ' ' | grep -v '^$' || true)

  DOMAIN_ARGS="-d shop.hexalyte.com -d shop.clothing.api.hexalyte.com -d admin3.hexalyte.com"
  for s in $SUBDOMAINS; do
    DOMAIN_ARGS="$DOMAIN_ARGS -d ${s}.shop.hexalyte.com"
  done

  echo "Domains: $DOMAIN_ARGS"
  certbot certonly --standalone $DOMAIN_ARGS \
    --non-interactive --agree-tos -m "$EMAIL" --expand --force-renewal
  copy_certs "/etc/letsencrypt/live/shop.hexalyte.com"
fi

echo "==> Starting nginx..."
docker compose up -d nginx
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload || true

echo "==> SSL renewal complete"
