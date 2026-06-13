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
