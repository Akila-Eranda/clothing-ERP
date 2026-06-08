#!/usr/bin/env python3
"""Deploy hardware vertical demo to production."""
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
    "apps/api/prisma/seed.js",
    "apps/web/src/lib/shop-profiles.ts",
    "apps/web/src/lib/use-shop-profile.ts",
    "apps/web/src/components/products/add-product-modal.tsx",
    "apps/web/src/app/(dashboard)/purchases/[id]/print-tags/page.tsx",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

echo "==> Build api + web..."
docker compose build api web
docker compose up -d api web
sleep 15

echo "==> Seed hardware demo tenant..."
docker compose exec -u root -T api node prisma/seed.js

docker compose up -d web nginx
sleep 6

curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo "==> DONE — hardware demo at https://hardware.shop.hexalyte.com"
echo "    Login: admin@hardware.demo.fashionerp.com / Admin@123456 (subdomain: hardware)"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

sftp = client.open_sftp()
for rel in FILES:
    local = os.path.join(ROOT, rel.replace("/", os.sep))
    remote = f"{DEPLOY_DIR}/{rel}"
    sftp.put(local, remote)
    print(f"Uploaded {rel}")

with sftp.file("/tmp/deploy_hardware.sh", "w") as f:
    f.write(DEPLOY)
sftp.chmod("/tmp/deploy_hardware.sh", 0o755)
sftp.close()

_, stdout, stderr = client.exec_command("bash /tmp/deploy_hardware.sh", timeout=1200)
print(stdout.read().decode("utf-8", errors="replace"))
if stderr.read().strip():
    print("STDERR:", stderr.read().decode("utf-8", errors="replace"))
client.close()
