#!/usr/bin/env python3
"""Hotfix: hide bank balances in POS bank account dropdown."""
import sys
import paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(r"E:\clothing shop")
REL = "apps/web/src/components/pos/pos-overlay.tsx"

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
docker compose build web
docker compose up -d web
sleep 5
echo "BANK_BALANCE_HIDDEN"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    local = ROOT / REL
    remote = f"{DEPLOY_DIR}/{REL}"
    print(f"Upload {REL}")
    with open(local, "rb") as lf:
        with sftp.file(remote, "wb") as rf:
            rf.write(lf.read())
    with sftp.file("/tmp/deploy_hide_bank_bal.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_hide_bank_bal.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/deploy_hide_bank_bal.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
