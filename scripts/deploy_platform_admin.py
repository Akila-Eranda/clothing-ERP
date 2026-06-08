#!/usr/bin/env python3
"""Deploy platform-admin isolation changes to production server."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
DEPLOY_DIR = "/opt/fashionerp"
ROOT = r"e:\clothing shop"

FILES = [
    "apps/api/src/config/app.config.ts",
    "apps/api/src/modules/auth/auth.service.ts",
    "apps/api/src/modules/auth/auth.controller.ts",
    "apps/api/prisma/seed.ts",
    "apps/api/prisma/seed.js",
    "apps/web/src/lib/admin-api.ts",
    "apps/web/src/app/admin/login/page.tsx",
    "apps/web/src/middleware.ts",
    "apps/web/Dockerfile",
    "docker-compose.yml",
]

DEPLOY_SCRIPT = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

echo "==> Rebuild api + web..."
docker compose build api web
docker compose up -d api web nginx

sleep 20

echo "==> Run seed (platform admin + fix tenant roles)..."
docker compose exec -u root -T api node prisma/seed.js

echo "==> Verify tenant admin blocked from platform login..."
curl -s -X POST http://localhost:3001/api/v1/auth/platform-login \\
  -H 'Content-Type: application/json' \\
  -d '{{"email":"admin@demo.fashionerp.com","password":"Admin@123456"}}'
echo ""

echo "==> Verify company admin can login..."
curl -s -X POST http://localhost:3001/api/v1/auth/platform-login \\
  -H 'Content-Type: application/json' \\
  -d '{{"email":"admin@hexalyte.com","password":"Admin@123456"}}'
echo ""

echo "==> DONE"
"""


def upload_tree(sftp, local_root, rel_path, remote_base):
    local = os.path.join(local_root, rel_path.replace("/", os.sep))
    remote = f"{remote_base}/{rel_path}"
    remote_dir = os.path.dirname(remote)
    try:
        sftp.stat(remote_dir)
    except FileNotFoundError:
        # mkdir -p
        parts = remote_dir.split("/")
        for i in range(2, len(parts) + 1):
            d = "/".join(parts[:i])
            try:
                sftp.stat(d)
            except FileNotFoundError:
                sftp.mkdir(d)
    sftp.put(local, remote)


client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

sftp = client.open_sftp()
for rel in FILES:
    print(f"Upload: {rel}")
    upload_tree(sftp, ROOT, rel, DEPLOY_DIR)
sftp.close()

sftp = client.open_sftp()
with sftp.file("/tmp/deploy_platform_admin.sh", "w") as f:
    f.write(DEPLOY_SCRIPT)
sftp.chmod("/tmp/deploy_platform_admin.sh", 0o755)
sftp.close()

_, stdout, stderr = client.exec_command("bash /tmp/deploy_platform_admin.sh", timeout=3600)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err)
