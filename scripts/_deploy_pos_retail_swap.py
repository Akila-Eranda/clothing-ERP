#!/usr/bin/env python3
"""Deploy with swap + web-first build to survive low RAM."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PASSWORD = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
if not PASSWORD:
    sys.exit("Need DEPLOY_SSH_PASSWORD")

DEPLOY = r"""#!/bin/bash
set -e
cd /opt/fashionerp

echo "==> Ensure swap (4G)..."
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -h

echo "==> Git sync..."
git fetch origin main
git reset --hard origin/main
git log -1 --oneline

echo "==> Pause heavy neighbors (best effort)..."
docker stop hexalyte-invoice-app 2>/dev/null || true

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "==> Build WEB..."
docker compose build web
docker compose up -d web nginx

echo "==> Build API..."
docker compose build api
docker compose up -d api

docker start hexalyte-invoice-app 2>/dev/null || true

sleep 12
echo "==> Health..."
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep fashionerp
echo SWAP_DEPLOY_DONE
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
client.connect("95.217.14.198", username="root", password=PASSWORD, timeout=30)

with client.open_sftp() as sftp:
    with sftp.file("/tmp/deploy_swap_web.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_swap_web.sh", 0o755)

_, stdout, stderr = client.exec_command("bash /tmp/deploy_swap_web.sh", timeout=900000)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print(out[-12000:] if len(out) > 12000 else out)
if err.strip():
    print("STDERR:", err[-3000:])
client.close()
