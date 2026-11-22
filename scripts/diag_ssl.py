#!/usr/bin/env python3
"""Diagnose SSL on production server."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
REMOTE = "/opt/fashionerp"

DIAG = f"""#!/bin/bash
set +e
cd {REMOTE}

echo "=== DOCKER STATUS ==="
docker compose ps

echo ""
echo "=== NGINX LOGS (last 30) ==="
docker compose logs nginx --tail 30 2>&1

echo ""
echo "=== SSL FILES ==="
ls -la nginx/ssl/*/fullchain.pem 2>/dev/null | head -20

echo ""
echo "=== CERTBOT CERTS ==="
certbot certificates 2>/dev/null | head -60

echo ""
echo "=== WILDCARD CERT SAN ==="
if [ -f nginx/ssl/wildcard.shop.hexalyte.com/fullchain.pem ]; then
  openssl x509 -in nginx/ssl/wildcard.shop.hexalyte.com/fullchain.pem -noout -subject -dates -ext subjectAltName 2>/dev/null
else
  echo "MISSING wildcard cert file"
fi

echo ""
echo "=== TENANT SUBDOMAINS IN DB ==="
docker compose exec -T postgres psql -U fashionerp -d fashionerp -tAc \\
  "SELECT subdomain FROM tenants WHERE subdomain NOT IN ('platform', '__platform_config__') ORDER BY subdomain"

echo ""
echo "=== CURL TESTS ==="
for host in shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com tyres.shop.hexalyte.com general.shop.hexalyte.com; do
  code=$(curl -sk -o /dev/null -w '%{{http_code}}' --connect-timeout 8 "https://$host/" 2>/dev/null || echo ERR)
  echo "$host -> HTTP $code"
done

echo ""
echo "=== OPENSSL SNI TESTS ==="
for host in tyres.shop.hexalyte.com general.shop.hexalyte.com; do
  echo "--- $host ---"
  echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName 2>/dev/null || echo FAIL
done

echo ""
echo "=== CLOUDFLARE INI ==="
ls -la nginx/ssl/cloudflare.ini 2>/dev/null || echo "no cloudflare.ini"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/diag_ssl.sh", "w") as f:
        f.write(DIAG)
    sftp.chmod("/tmp/diag_ssl.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/diag_ssl.sh", timeout=120000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
