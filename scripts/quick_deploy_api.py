#!/usr/bin/env python3
"""Quick deploy: pull, rebuild API only, fix uploads permissions."""
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
git fetch origin main
git reset --hard origin/main
docker compose build api
docker compose up -d api
docker compose exec -u root -T api sh -c 'mkdir -p /app/uploads; chown -R nestjs:nodejs /app/uploads'
sleep 8
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo "API deploy complete"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with client.open_sftp() as sftp:
    with sftp.file("/tmp/quick_deploy_api.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/quick_deploy_api.sh", 0o755)
_, stdout, stderr = client.exec_command("bash /tmp/quick_deploy_api.sh", timeout=900)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
client.close()
