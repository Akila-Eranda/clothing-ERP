#!/usr/bin/env python3
"""Deploy latest commit (storage, images, GENERAL shop type, POS) to production."""
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
    "apps/api/prisma/schema.prisma",
    "apps/api/prisma/seed.js",
    "apps/api/prisma/seed.ts",
    "apps/api/prisma/migrations/20260707190000_shop_type_general/migration.sql",
    "apps/api/src/config/storage.config.ts",
    "apps/api/src/modules/files/files.module.ts",
    "apps/api/src/shared/shop-profiles.ts",
    "apps/web/src/app/(dashboard)/inventory/page.tsx",
    "apps/web/src/app/(dashboard)/products/new/page.tsx",
    "apps/web/src/app/(dashboard)/products/[id]/edit/page.tsx",
    "apps/web/src/app/features/page.tsx",
    "apps/web/src/components/pos/pos-overlay.tsx",
    "apps/web/src/components/products/add-product-modal.tsx",
    "apps/web/src/components/products/product-image-upload.tsx",
    "apps/web/src/lib/erp-capabilities.ts",
    "apps/web/src/lib/shop-features.ts",
    "apps/web/src/lib/shop-profiles.ts",
    "apps/web/src/lib/shop-vertical.ts",
    "apps/web/src/lib/shop-workspace.ts",
    "scripts/setup_storage.sh",
    "scripts/process_ssl_pending.sh",
    "storage/.gitkeep",
]

DELETE_REMOTE = [
    "apps/web/src/components/inventory/stock-barcode-scan-panel.tsx",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {REMOTE}

echo "==> Initialize storage..."
chmod +x scripts/setup_storage.sh
bash scripts/setup_storage.sh

echo "==> Build api..."
docker compose build api
docker compose up -d api

echo "==> Build web..."
docker compose build web
docker compose up -d web nginx

echo "==> Fix permissions..."
docker compose exec -u root -T api sh -c 'mkdir -p /app/uploads/.ssl-pending && chown -R nestjs:nodejs /app/uploads'

sleep 12
echo "==> Database schema..."
docker compose exec -u root -T api npx prisma db push --accept-data-loss

echo "==> Seed..."
docker compose cp apps/api/prisma/seed.js api:/app/prisma/seed.js
docker compose exec -u root -T api node prisma/seed.js

curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo "DEPLOY DONE"
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
        print(f"  upload {rel}")
        sftp.put(local, remote)

    for rel in DELETE_REMOTE:
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        try:
            sftp.remove(remote)
            print(f"  delete {rel}")
        except FileNotFoundError:
            pass

    with sftp.file("/tmp/deploy_latest.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_latest.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/deploy_latest.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-6000:])
c.close()
