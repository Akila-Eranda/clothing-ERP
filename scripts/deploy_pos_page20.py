#!/usr/bin/env python3
"""Deploy POS products pagination (20 per page)."""
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
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
grep -n "paginated\\|POS_PAGE_SIZE\\|page= for" apps/api/src/modules/pos/pos.module.ts apps/web/src/components/pos/pos-overlay.tsx | head -25
docker compose build api web
docker compose up -d api web
sleep 12
echo POS_PAGE20_DEPLOYED
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
    with sftp.file("/tmp/deploy_pos_page20.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_pos_page20.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/deploy_pos_page20.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-8000:])
c.close()
