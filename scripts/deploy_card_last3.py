#!/usr/bin/env python3
"""Deploy POS card last-3 digits payment requirement."""
import sys
import paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(r"E:\clothing shop")

FILES = [
    "apps/web/src/components/pos/pos-overlay.tsx",
    "apps/web/src/components/pos/pos-payment-panel.tsx",
    "apps/api/src/modules/pos/pos.module.ts",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
docker compose build api web
docker compose up -d api web
sleep 8
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 160
echo ""
echo "CARD LAST3 DEPLOYED"
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
    with sftp.file("/tmp/deploy_card_last3.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_card_last3.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/deploy_card_last3.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-5000:])
c.close()
