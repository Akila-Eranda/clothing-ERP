#!/usr/bin/env python3
"""Hotfix deploy: upload changed web files + rebuild web container."""
import sys
import paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(r"e:\clothing shop")

FILES = [
    "apps/web/src/components/pos/pos-overlay.tsx",
    "apps/web/src/components/pos/pos-shift-gate.tsx",
    "apps/web/src/app/(dashboard)/dashboard/page.tsx",
    "apps/web/src/app/(dashboard)/cash/page.tsx",
    "apps/web/src/components/cash/cash-movement-ledger.tsx",
    "apps/web/src/components/cash/shift-detail-sheet.tsx",
    "apps/web/src/app/(auth)/register/page.tsx",
    "apps/web/src/app/(auth)/login/page.tsx",
    "apps/api/src/modules/auth/auth.service.ts",
    "apps/api/src/modules/cash-management/cash-management.module.ts",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
echo "==> Build web (+ api if auth.service changed)..."
docker compose build web api
docker compose up -d web api
sleep 8
echo "==> Health..."
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 120
echo ""
echo "HOTFIX DEPLOY COMPLETE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = ROOT / rel
        remote = f"{DEPLOY_DIR}/{rel.replace(chr(92), '/')}"
        print(f"Upload {rel}")
        with open(local, "rb") as lf:
            with sftp.file(remote, "wb") as rf:
                rf.write(lf.read())
    with sftp.file("/tmp/hotfix_deploy_web.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/hotfix_deploy_web.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/hotfix_deploy_web.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-8000:])
c.close()
