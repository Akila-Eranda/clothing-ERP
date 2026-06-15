#!/usr/bin/env python3
"""Full deploy: pull, build api+web, db push, nginx reload, SSL cron."""
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

echo "==> Git pull..."
git fetch origin main
git reset --hard origin/main

echo "==> Build api + web..."
docker compose build api web
docker compose up -d

echo "==> Uploads permissions..."
docker compose exec -u root -T api sh -c 'mkdir -p /app/uploads/.ssl-pending && chown -R nestjs:nodejs /app/uploads'

echo "==> Database schema..."
docker compose exec -u root -T api npx prisma db push --accept-data-loss

echo "==> Seed permissions..."
docker compose exec -u root -T api node prisma/seed.js || true

echo "==> SSL pending cron..."
chmod +x scripts/process_ssl_pending.sh scripts/renew_tenant_ssl.sh || true
CRON_LINE='*/3 * * * * root cd {DEPLOY_DIR} && bash scripts/process_ssl_pending.sh >> /var/log/fashionerp-ssl-pending.log 2>&1'
grep -q 'process_ssl_pending.sh' /etc/cron.d/fashionerp-ssl 2>/dev/null || echo "$CRON_LINE" > /etc/cron.d/fashionerp-ssl
chmod 644 /etc/cron.d/fashionerp-ssl || true

echo "==> Nginx reload..."
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

sleep 6
echo "==> Health..."
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
curl -sI https://demo.shop.hexalyte.com/login | head -3
echo ""
echo "DEPLOY COMPLETE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/quick_deploy_full.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/quick_deploy_full.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/quick_deploy_full.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-5000:])
c.close()
