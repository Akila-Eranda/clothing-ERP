#!/usr/bin/env python3
"""Deploy on-server file storage: bind mount, nginx, API config."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
ROOT = r"e:\clothing shop"
REMOTE = "/opt/fashionerp"

FILES = [
    "docker-compose.yml",
    "nginx/nginx.clothing.conf",
    "apps/api/src/modules/files/files.module.ts",
    "apps/api/src/config/storage.config.ts",
    "scripts/setup_storage.sh",
    "scripts/process_ssl_pending.sh",
    "storage/.gitkeep",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {REMOTE}

echo "==> Initialize on-server storage..."
chmod +x scripts/setup_storage.sh
bash scripts/setup_storage.sh

echo "==> Rebuild api + nginx with storage bind mount..."
docker compose build api
docker compose up -d api nginx

echo "==> Fix container permissions..."
docker compose exec -u root -T api sh -c 'mkdir -p /app/uploads/.ssl-pending && chown -R nestjs:nodejs /app/uploads'

sleep 8
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo "STORAGE DEPLOY DONE — files at {REMOTE}/storage"
ls -la storage | head -20
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        remote_dir = os.path.dirname(remote).replace(chr(92), "/")
        parts = remote_dir.split("/")
        path = ""
        for p in parts:
            if not p:
                continue
            path += f"/{p}"
            try:
                sftp.stat(path)
            except FileNotFoundError:
                try:
                    sftp.mkdir(path)
                except OSError:
                    pass
        print(f"  {rel}")
        sftp.put(local, remote)

with c.open_sftp() as sftp:
    with sftp.file("/tmp/deploy_storage.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_storage.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/deploy_storage.sh", timeout=600)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err)
c.close()
