#!/usr/bin/env python3
"""Full production deploy: git pull, build, migrate, seed, SSL."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
DEPLOY_DIR = "/opt/fashionerp"

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

echo "==> Git pull latest..."
git fetch origin main
git reset --hard origin/main

echo "==> Build api + web..."
docker compose build api web
docker compose up -d

echo "==> Fix uploads volume permissions..."
docker compose exec -u root -T api sh -c 'mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads'

echo "==> Waiting for API to become healthy..."
for i in $(seq 1 45); do
  if curl -sk -f https://shop.clothing.api.hexalyte.com/api/v1/health >/dev/null 2>&1; then
    echo "API ready after attempt $i"
    break
  fi
  sleep 2
done

echo "==> Database schema..."
docker compose exec -u root -T api npx prisma db push --accept-data-loss

echo "==> Seed demo tenants..."
docker compose exec -u root -T api node prisma/seed.js

echo "==> Renew SSL for all tenant subdomains..."
SUBDOMAINS=$(docker compose exec -T postgres psql -U fashionerp -d fashionerp -tAc \\
  "SELECT subdomain FROM tenants WHERE subdomain NOT IN ('platform') ORDER BY subdomain" | tr -d ' ' | grep -v '^$' || true)
DOMAIN_ARGS="-d shop.hexalyte.com -d shop.clothing.api.hexalyte.com -d admin3.hexalyte.com"
for s in $SUBDOMAINS; do
  DOMAIN_ARGS="$DOMAIN_ARGS -d ${{s}}.shop.hexalyte.com"
done
docker compose stop nginx
certbot certonly --standalone $DOMAIN_ARGS \\
  --non-interactive --agree-tos -m admin@hexalyte.com --expand --force-renewal
for dir in shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com wildcard.shop.hexalyte.com; do
  mkdir -p "nginx/ssl/$dir"
  cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem "nginx/ssl/$dir/"
  cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem "nginx/ssl/$dir/"
done
docker compose up -d nginx
echo "SSL updated for: $SUBDOMAINS"

echo "==> Health check..."
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo "==> DEPLOY COMPLETE"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with client.open_sftp() as sftp:
    with sftp.file("/tmp/deploy_all.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_all.sh", 0o755)

_, stdout, stderr = client.exec_command("bash /tmp/deploy_all.sh", timeout=1800)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
client.close()
