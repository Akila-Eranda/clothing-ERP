#!/usr/bin/env python3
"""Diagnose domain DNS + SSL + nginx routing on production."""
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

echo "=== SERVER TIME / UPTIME ==="
date
uptime

echo ""
echo "=== DOCKER / NGINX ==="
docker compose ps
echo "--- nginx last 40 lines ---"
docker compose logs nginx --tail 40 2>&1 | tail -40

echo ""
echo "=== CERT SAN (wildcard.shop) ==="
openssl x509 -in nginx/ssl/wildcard.shop.hexalyte.com/fullchain.pem -noout -dates -ext subjectAltName 2>/dev/null | head -40

echo ""
echo "=== TENANTS IN DB ==="
docker compose exec -T postgres psql -U fashionerp -d fashionerp -tAc \\
  "SELECT subdomain FROM tenants WHERE subdomain NOT IN ('platform','__platform_config__') ORDER BY subdomain"

echo ""
echo "=== DNS FROM SERVER ==="
for host in shop.hexalyte.com general.shop.hexalyte.com tyres.shop.hexalyte.com sl-deen-supermarket.shop.hexalyte.com; do
  echo "--- $host ---"
  getent hosts "$host" 2>/dev/null || true
  dig +short A "$host" 2>/dev/null || nslookup "$host" 2>/dev/null | head -8
done

echo ""
echo "=== LOCAL HTTPS + SNI ==="
for host in shop.hexalyte.com shop.clothing.api.hexalyte.com general.shop.hexalyte.com sl-deen-supermarket.shop.hexalyte.com; do
  code=$(curl -sk -o /dev/null -w '%{{http_code}}' --connect-timeout 8 -H "Host: $host" "https://127.0.0.1/" 2>/dev/null || echo ERR)
  echo "$host local-proxy HTTP $code"
  echo | openssl s_client -connect 127.0.0.1:443 -servername "$host" 2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null | head -5
done

echo ""
echo "=== PUBLIC CURL ==="
for host in shop.hexalyte.com general.shop.hexalyte.com sl-deen-supermarket.shop.hexalyte.com; do
  echo "--- $host ---"
  curl -sI --connect-timeout 10 "https://$host/" 2>&1 | head -15
  echo
done

echo ""
echo "=== SSL PENDING / CRON ==="
ls -la storage/.ssl-pending 2>/dev/null || echo no-pending-dir
grep -F process_ssl_pending /etc/crontab 2>/dev/null || echo no-cron-line
tail -20 /var/log/fashionerp-ssl-pending.log 2>/dev/null || echo no-ssl-log

echo ""
echo "=== NGINX LISTEN ==="
ss -lntp | grep -E ':80|:443' || true
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/diag_domain_ssl.sh", "w") as f:
        f.write(DIAG)
    sftp.chmod("/tmp/diag_domain_ssl.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/diag_domain_ssl.sh", timeout=180000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-4000:])
c.close()
