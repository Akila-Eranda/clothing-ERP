#!/usr/bin/env python3
"""Deploy POS Bank Transfer + QR payment with bank account deposit."""
import sys
import paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(r"E:\clothing shop")

FILES = [
    "apps/api/prisma/schema.prisma",
    "apps/api/src/modules/pos/pos.module.ts",
    "apps/api/src/modules/accounting/accounting-posting.service.ts",
    "apps/web/src/components/pos/pos-overlay.tsx",
    "apps/web/src/components/pos/pos-payment-panel.tsx",
    "apps/web/src/components/pos/pos-shortcuts.ts",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
echo "==> Build api + web..."
docker compose build api web
docker compose up -d api web
echo "==> Prisma db push (QR + sale_payments.bankAccountId)..."
docker compose exec -u root -T api npx prisma db push --accept-data-loss
sleep 10
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 180
echo ""
echo "BANK_TRANSFER_QR DEPLOYED"
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
    with sftp.file("/tmp/deploy_bank_qr_pay.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_bank_qr_pay.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/deploy_bank_qr_pay.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-8000:])
c.close()
