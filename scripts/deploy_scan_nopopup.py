#!/usr/bin/env python3
import sys
import paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(r"E:\clothing shop")
FILES = [
    "apps/web/src/lib/pos-weight.ts",
    "apps/web/src/components/pos/pos-overlay.tsx",
    "apps/web/src/components/pos/use-pos-keyboard.ts",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
echo "==> Verify source has auto-pick finishScan..."
grep -n "auto-pick best match" apps/web/src/components/pos/pos-overlay.tsx | head -3
docker compose build web
docker compose up -d web
sleep 8
echo SCAN_NOPOPUP_DEPLOYED
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
    with sftp.file("/tmp/deploy_scan_nopopup.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_scan_nopopup.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/deploy_scan_nopopup.sh", timeout=600000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-4000:])
c.close()
