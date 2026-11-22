#!/usr/bin/env python3
"""Deploy Deen POS catalog speed fix (full product cache + no post-sale reload)."""
import sys
import paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(r"E:\clothing shop")
FILES = [
    "apps/api/src/modules/pos/pos.module.ts",
    "apps/web/src/components/pos/pos-overlay.tsx",
    "apps/web/src/components/pos/use-pos-keyboard.ts",
    "apps/web/src/lib/pos-weight.ts",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
docker compose build api web
docker compose up -d api web
sleep 12
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 120
echo ""
echo DEEN_POS_FAST_DEPLOYED
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    for rel in FILES:
        print("Upload", rel)
        with open(ROOT / rel, "rb") as lf, sftp.file(f"{DEPLOY_DIR}/{rel}", "wb") as rf:
            rf.write(lf.read())
    with sftp.file("/tmp/deploy_deen_pos_fast.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_deen_pos_fast.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/deploy_deen_pos_fast.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-6000:])
c.close()
