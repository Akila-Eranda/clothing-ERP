#!/usr/bin/env python3
"""Zero-downtime-ish web deploy: build while old container stays up, then recreate web only."""
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

echo "==> Ensure stack is up (no full down)"
docker compose up -d db redis api 2>/dev/null || true

echo "==> Pull latest"
git fetch origin main
git reset --hard origin/main

echo "==> Sync brand assets (no service stop)"
mkdir -p /var/www/web-public/brand
cp -f apps/web/public/brand/hexalyte-innovation.png /var/www/web-public/brand/ 2>/dev/null || true
cp -f apps/web/public/brand/hexalyte-white.png /var/www/web-public/brand/ 2>/dev/null || true

echo "==> Build web (old web keeps serving)"
docker compose build web

echo "==> Recreate web only (brief swap, no compose down)"
docker compose up -d --force-recreate --no-deps web

echo "==> Keep/start nginx without stopping api/db"
docker compose up -d --no-deps nginx
docker compose exec -T nginx nginx -t 2>/dev/null && docker compose exec -T nginx nginx -s reload || true

sleep 6
docker compose ps web nginx api
curl -s -o /dev/null -w "login:%{http_code}\\n" https://grocery.shop.hexalyte.com/login
echo DEPLOY_OK
"""

stdin, stdout, stderr = c.exec_command("bash -s", timeout=1200)
stdin.write(script)
stdin.channel.shutdown_write()
out = stdout.read().decode("utf-8", "replace")
err = stderr.read().decode("utf-8", "replace")
print(out[-5000:] if len(out) > 5000 else out)
if err.strip():
    print("STDERR:", err[-2500:])
code = stdout.channel.recv_exit_status()
c.close()
if code != 0 or "DEPLOY_OK" not in out:
    raise SystemExit(code or 1)
