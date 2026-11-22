#!/usr/bin/env python3
"""Deploy thermal receipt light-mode-only fix."""
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
    "apps/web/src/components/pos/pos-overlay.tsx",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
echo "==> Build web..."
docker compose build web
docker compose up -d web
sleep 6
echo "RECEIPT LIGHT FIX DEPLOYED"
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
    with sftp.file("/tmp/deploy_receipt_light_fix.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_receipt_light_fix.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/deploy_receipt_light_fix.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-6000:])
c.close()
