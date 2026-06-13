#!/usr/bin/env python3
"""Reload nginx with latest LE certs and verify jo-lanka HTTPS."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"

FIX = r"""#!/bin/bash
set -e
cd /opt/fashionerp

echo "==> Refresh nginx cert files from Let's Encrypt..."
for dir in shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com wildcard.shop.hexalyte.com; do
  mkdir -p "nginx/ssl/$dir"
  cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem "nginx/ssl/$dir/"
  cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem "nginx/ssl/$dir/"
done

echo "==> Test & reload nginx..."
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

echo "==> Verify jo-lanka HTTPS cert SAN..."
echo | openssl s_client -connect jo-lanka.shop.hexalyte.com:443 -servername jo-lanka.shop.hexalyte.com 2>/dev/null \
  | openssl x509 -noout -ext subjectAltName | grep jo-lanka || echo "MISSING jo-lanka in cert!"

echo "==> HTTP redirect:"
curl -sI http://jo-lanka.shop.hexalyte.com/ | grep -E 'HTTP|Location'

echo "==> DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
sftp = c.open_sftp()
with sftp.file("/tmp/reload_ssl.sh", "w") as f:
    f.write(FIX)
sftp.chmod("/tmp/reload_ssl.sh", 0o755)
sftp.close()
_, stdout, stderr = c.exec_command("bash /tmp/reload_ssl.sh", timeout=120)
print(stdout.read().decode("utf-8", errors="replace"))
if stderr.read().strip():
    print("STDERR:", stderr.read().decode()[-2000:])
c.close()
