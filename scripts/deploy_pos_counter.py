#!/usr/bin/env python3
"""Deploy POS cashier counter selection on shift login."""
import sys
import paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(r"E:\clothing shop")

FILES = [
    "apps/api/prisma/schema.prisma",
    "apps/api/src/shared/cash-register.helper.ts",
    "apps/api/src/modules/cash-management/cash-management.module.ts",
    "apps/api/src/modules/pos/pos.module.ts",
    "apps/web/src/lib/pos-counter.ts",
    "apps/web/src/lib/api.ts",
    "apps/web/src/components/pos/pos-shift-gate.tsx",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
echo "==> Build api + web..."
docker compose build api web
docker compose up -d api web
echo "==> Prisma db push (pos_counters)..."
docker compose exec -u root -T api npx prisma db push --accept-data-loss
docker compose exec -u root -T api npx prisma generate || true
sleep 10
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 180
echo ""
echo "POS_COUNTER_DEPLOYED"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    for rel in FILES:
        local = ROOT / rel
        remote = f"{DEPLOY_DIR}/{rel}"
        print(f"Upload {rel}")
        with open(local, "rb") as lf:
            with sftp.file(remote, "wb") as rf:
                rf.write(lf.read())
    with sftp.file("/tmp/deploy_pos_counter.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_pos_counter.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/deploy_pos_counter.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-8000:])
c.close()
