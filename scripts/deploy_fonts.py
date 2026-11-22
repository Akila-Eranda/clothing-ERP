#!/usr/bin/env python3
"""Deploy font fix for Sinhala/unicode text rendering."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
ROOT = r"e:\clothing shop"
REMOTE = "/opt/fashionerp"

FILES = [
    "apps/web/src/lib/fonts.ts",
    "apps/web/src/app/layout.tsx",
    "apps/web/src/app/globals.css",
    "apps/web/tailwind.config.ts",
    "apps/web/src/components/layout/sidebar.tsx",
    "apps/web/src/lib/shop-vertical.ts",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {REMOTE}
docker compose build web
docker compose up -d web
sleep 10
echo "FONT FIX DEPLOYED"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        print(f"  {rel}")
        sftp.put(local, remote)
    with sftp.file("/tmp/deploy_fonts.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_fonts.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/deploy_fonts.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-4000:])
c.close()
