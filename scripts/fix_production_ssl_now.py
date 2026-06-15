#!/usr/bin/env python3
"""Emergency SSL renew on production — excludes invalid platform subdomains."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"

FIX = r"""#!/bin/bash
set -e
cd /opt/fashionerp

SUBDOMAINS=$(docker compose exec -T postgres psql -U fashionerp -d fashionerp -tAc \
  "SELECT subdomain FROM tenants WHERE subdomain NOT IN ('platform', '__platform_config__') AND subdomain ~ '^[a-z0-9-]+$' ORDER BY subdomain" | tr -d ' ' | grep -v '^$' || true)

DOMAIN_ARGS="-d shop.hexalyte.com -d shop.clothing.api.hexalyte.com -d admin3.hexalyte.com"
for s in $SUBDOMAINS; do
  DOMAIN_ARGS="$DOMAIN_ARGS -d ${s}.shop.hexalyte.com"
done

echo "Tenants: $SUBDOMAINS"
echo "Cert domains: $DOMAIN_ARGS"

docker compose stop nginx || true
certbot certonly --standalone $DOMAIN_ARGS \
  --non-interactive --agree-tos -m admin@hexalyte.com --expand --force-renewal

for dir in shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com wildcard.shop.hexalyte.com; do
  mkdir -p "nginx/ssl/$dir"
  cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem "nginx/ssl/$dir/"
  cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem "nginx/ssl/$dir/"
done

docker compose up -d nginx
sleep 3
docker compose ps nginx

echo "==> Verify akila SSL..."
echo | openssl s_client -connect akila.shop.hexalyte.com:443 -servername akila.shop.hexalyte.com 2>/dev/null | openssl x509 -noout -subject 2>/dev/null || true

echo "DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
sftp = c.open_sftp()
with sftp.file("/tmp/fix_ssl_now.sh", "w") as f:
    f.write(FIX)
sftp.chmod("/tmp/fix_ssl_now.sh", 0o755)
sftp.close()
_, stdout, stderr = c.exec_command("bash /tmp/fix_ssl_now.sh", timeout=600)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-4000:])
c.close()
