#!/usr/bin/env python3
"""Deploy POS product image loading fix."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
ROOT = r"e:\clothing shop"
REMOTE = "/opt/fashionerp"

FILES = [
    "apps/web/src/components/pos/pos-overlay.tsx",
    "apps/web/src/components/products/product-image-upload.tsx",
    "apps/web/src/components/products/add-product-modal.tsx",
    "apps/web/src/app/(dashboard)/products/new/page.tsx",
    "apps/web/src/app/(dashboard)/products/[id]/edit/page.tsx",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {REMOTE}
docker compose build web
docker compose up -d web
sleep 10
echo "POS IMAGE DEPLOY DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        remote_dir = os.path.dirname(remote).replace(chr(92), "/")
        parts = remote_dir.split("/")
        path = ""
        for p in parts:
            if not p:
                continue
            path += f"/{p}"
            try:
                sftp.stat(path)
            except FileNotFoundError:
                try:
                    sftp.mkdir(path)
                except OSError:
                    pass
        print(f"  {rel}")
        sftp.put(local, remote)

with c.open_sftp() as sftp:
    with sftp.file("/tmp/deploy_pos_images.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_pos_images.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/deploy_pos_images.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-4000:])
c.close()
