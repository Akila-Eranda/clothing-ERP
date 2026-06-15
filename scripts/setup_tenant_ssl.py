#!/usr/bin/env python3
"""Issue SSL cert covering all tenant *.shop.hexalyte.com subdomains."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
DEPLOY_DIR = "/opt/fashionerp"
EMAIL = "admin@hexalyte.com"

SETUP = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

echo "==> Fetch tenant subdomains from database..."
SUBDOMAINS=$(docker compose exec -T postgres psql -U fashionerp -d fashionerp -tAc \\
  "SELECT subdomain FROM tenants WHERE subdomain NOT IN ('platform', '__platform_config__') AND subdomain ~ '^[a-z0-9-]+$' ORDER BY subdomain" | tr -d ' ' | grep -v '^$' || true)
echo "Tenants: $SUBDOMAINS"

DOMAIN_ARGS="-d shop.hexalyte.com -d shop.clothing.api.hexalyte.com -d admin3.hexalyte.com"
for s in $SUBDOMAINS; do
  DOMAIN_ARGS="$DOMAIN_ARGS -d ${{s}}.shop.hexalyte.com"
done
echo "Cert domains: $DOMAIN_ARGS"

echo "==> Stop nginx for certbot..."
docker compose stop nginx

echo "==> Expand Let's Encrypt certificate..."
certbot certonly --standalone \\
  $DOMAIN_ARGS \\
  --non-interactive --agree-tos -m {EMAIL} \\
  --expand --force-renewal

echo "==> Copy certs to nginx ssl folders..."
for dir in shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com wildcard.shop.hexalyte.com; do
  mkdir -p "nginx/ssl/$dir"
  cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem "nginx/ssl/$dir/"
  cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem "nginx/ssl/$dir/"
done

echo "==> Start nginx..."
docker compose up -d nginx
sleep 4

echo "==> Verify SSL for each tenant..."
for s in $SUBDOMAINS; do
  SUBJECT=$(echo | openssl s_client -connect "$s.shop.hexalyte.com:443" -servername "$s.shop.hexalyte.com" 2>/dev/null | openssl x509 -noout -subject 2>/dev/null || echo FAIL)
  echo "  $s.shop.hexalyte.com -> $SUBJECT"
done

echo "==> Verify API SSL..."
curl -skI https://shop.clothing.api.hexalyte.com/api/v1/health | head -2

echo "==> DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

sftp = c.open_sftp()
with sftp.file("/tmp/setup_tenant_ssl.sh", "w") as f:
    f.write(SETUP)
sftp.chmod("/tmp/setup_tenant_ssl.sh", 0o755)
sftp.close()

_, stdout, stderr = c.exec_command("bash /tmp/setup_tenant_ssl.sh", timeout=600)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err)
