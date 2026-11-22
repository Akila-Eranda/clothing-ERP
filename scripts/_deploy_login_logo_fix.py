#!/usr/bin/env python3
import sys
from _ssh_config import ssh_connect_kwargs
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)

script = """#!/bin/bash
set -e
cd /opt/fashionerp
docker compose down web nginx 2>/dev/null || true
docker rm -f fashionerp_web fashionerp_nginx 2>/dev/null || true
git fetch origin main
git reset --hard origin/main
mkdir -p /var/www/web-public/brand
cp -f apps/web/public/brand/hexalyte-innovation.png /var/www/web-public/brand/
cp -f apps/web/public/brand/hexalyte-white.png /var/www/web-public/brand/
docker compose build web
docker compose up -d web nginx
sleep 8
docker compose ps web nginx
curl -s -o /dev/null -w "login:%{http_code}\\n" https://grocery.shop.hexalyte.com/login
echo DEPLOY_OK
"""

stdin, stdout, stderr = c.exec_command("bash -s", timeout=600)
stdin.write(script)
stdin.channel.shutdown_write()
out = stdout.read().decode("utf-8", "replace")
err = stderr.read().decode("utf-8", "replace")
print(out[-4000:] if len(out) > 4000 else out)
if err.strip():
    print("STDERR:", err[-2000:])
code = stdout.channel.recv_exit_status()
c.close()
if code != 0 or "DEPLOY_OK" not in out:
    raise SystemExit(code or 1)
