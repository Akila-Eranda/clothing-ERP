#!/usr/bin/env python3
"""Fix nginx crash — use clothing-only config without hexalyte upstreams."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"

FIX = """#!/bin/bash
set -e
cd /opt/fashionerp
echo "==> Apply nginx.clothing.conf"
cp nginx/nginx.clothing.conf nginx/nginx.conf
docker compose up -d nginx
sleep 6
docker compose ps nginx api web
echo "==> Test HTTPS"
curl -skI https://shop.hexalyte.com | head -3
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 180
echo ""
curl -skI https://admin3.hexalyte.com/admin | head -3
curl -skI https://demo.shop.hexalyte.com | head -3
echo "==> FIXED"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with client.open_sftp() as sftp:
    with sftp.file("/tmp/fix_nginx.sh", "w") as f:
        f.write(FIX)
    sftp.chmod("/tmp/fix_nginx.sh", 0o755)
_, stdout, stderr = client.exec_command("bash /tmp/fix_nginx.sh", timeout=120)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-2000:])
client.close()
