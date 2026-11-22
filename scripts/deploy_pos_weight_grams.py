#!/usr/bin/env python3
"""Deploy POS weighted grams edit + decimal qty support."""
import sys
import paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(r"E:\clothing shop")

FILES = [
    "apps/api/prisma/schema.prisma",
    "apps/api/src/modules/pos/pos.module.ts",
    "apps/api/src/modules/inventory/inventory.dto.ts",
    "apps/web/src/lib/pos-weight.ts",
    "apps/web/src/types/index.ts",
    "apps/web/src/stores/cart-store.ts",
    "apps/web/src/components/pos/pos-quantity-popup.tsx",
    "apps/web/src/components/pos/pos-overlay.tsx",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
echo "==> Build api + web..."
docker compose build api web
docker compose up -d api web
echo "==> Prisma db push (decimal qty)..."
docker compose exec -u root -T api npx prisma db push --accept-data-loss
sleep 8
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 160
echo ""
echo "POS WEIGHT GRAMS DEPLOYED"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = ROOT / rel
        remote = f"{DEPLOY_DIR}/{rel}"
        print(f"Upload {rel}")
        with open(local, "rb") as lf:
            with sftp.file(remote, "wb") as rf:
                rf.write(lf.read())
    with sftp.file("/tmp/deploy_pos_weight.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_pos_weight.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/deploy_pos_weight.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-8000:])
c.close()
