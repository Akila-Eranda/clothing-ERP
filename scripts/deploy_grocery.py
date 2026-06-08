#!/usr/bin/env python3
"""Deploy grocery vertical + multi-shop foundation to production."""
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
    "apps/api/prisma/schema.prisma",
    "apps/api/prisma/seed.js",
    "apps/api/src/shared/shop-profiles.ts",
    "apps/api/src/modules/tenants/tenants.module.ts",
    "apps/web/src/lib/shop-profiles.ts",
    "apps/web/src/lib/use-shop-profile.ts",
    "apps/web/src/stores/auth-store.ts",
    "apps/web/src/components/products/add-product-modal.tsx",
    "apps/web/src/app/(dashboard)/purchases/[id]/print-tags/page.tsx",
    "apps/web/src/app/(auth)/register/page.tsx",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

echo "==> Build api + web..."
docker compose build api web
docker compose up -d api web
sleep 15

echo "==> Apply schema (shopType column)..."
docker compose exec -u root -T api npx prisma db push --accept-data-loss

echo "==> Seed grocery demo tenant..."
docker compose exec -u root -T api node prisma/seed.js

echo "==> Rebuild web (ensure latest bundle)..."
docker compose up -d web nginx
sleep 8

echo "==> Health check..."
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo "==> DONE — grocery demo at https://grocery.shop.hexalyte.com"
echo "    Login: admin@grocery.demo.fashionerp.com / Admin@123456 (subdomain: grocery)"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

sftp = client.open_sftp()
for rel in FILES:
    local = os.path.join(ROOT, rel.replace("/", os.sep))
    remote = f"{DEPLOY_DIR}/{rel}"
    os.makedirs(os.path.dirname(local), exist_ok=True)
    remote_dir = os.path.dirname(remote)
    try:
        sftp.stat(remote_dir)
    except FileNotFoundError:
        pass
    sftp.put(local, remote)
    print(f"Uploaded {rel}")

with sftp.file("/tmp/deploy_grocery.sh", "w") as f:
    f.write(DEPLOY)
sftp.chmod("/tmp/deploy_grocery.sh", 0o755)
sftp.close()

_, stdout, stderr = client.exec_command("bash /tmp/deploy_grocery.sh", timeout=1200)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print(out)
if err.strip():
    print("STDERR:", err)
client.close()
