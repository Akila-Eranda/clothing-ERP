#!/usr/bin/env python3
"""Deploy retail POS: sequential builds to avoid OOM kill."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = os.environ.get("DEPLOY_HOST", "95.217.14.198")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
DEPLOY_DIR = "/opt/fashionerp"

if not PASSWORD:
    print("ERROR: Set DEPLOY_SSH_PASSWORD", file=sys.stderr)
    sys.exit(1)

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

echo "==> Git pull..."
git fetch origin main
git reset --hard origin/main
git log -1 --oneline

echo "==> Free docker build cache (light)..."
docker builder prune -f >/dev/null 2>&1 || true

echo "==> Build api (solo)..."
docker compose build api
docker compose up -d api

echo "==> Build web (solo)..."
docker compose build web
docker compose up -d web nginx

sleep 12
echo "==> Health..."
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo "SEQUENTIAL DEPLOY DONE"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with client.open_sftp() as sftp:
    with sftp.file("/tmp/deploy_pos_seq.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_pos_seq.sh", 0o755)

_, stdout, stderr = client.exec_command("bash /tmp/deploy_pos_seq.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-4000:])
client.close()
