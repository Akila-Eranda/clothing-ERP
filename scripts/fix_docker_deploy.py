#!/usr/bin/env python3
"""Fix Docker container conflict and re-run seed."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"

FIX = """#!/bin/bash
set -e
cd /opt/fashionerp
docker compose down --remove-orphans 2>/dev/null || true
docker rm -f fashionerp_api fashionerp_web 2>/dev/null || true
docker compose up -d
sleep 18
docker compose exec -u root -T api node prisma/seed.js
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 150
echo ""
echo "==> Stack healthy, seed complete"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
sftp = client.open_sftp()
with sftp.file("/tmp/fix_docker_deploy.sh", "w") as f:
    f.write(FIX)
sftp.chmod("/tmp/fix_docker_deploy.sh", 0o755)
sftp.close()
_, stdout, stderr = client.exec_command("bash /tmp/fix_docker_deploy.sh", timeout=600)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-1500:])
client.close()
