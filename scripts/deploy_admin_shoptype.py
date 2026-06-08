#!/usr/bin/env python3
"""Deploy admin tenant onboarding shop-type selection."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
DEPLOY_DIR = "/opt/fashionerp"
ROOT = r"e:\clothing shop"

FILES = [
    "apps/web/src/lib/admin-api.ts",
    "apps/web/src/app/admin/tenants/page.tsx",
    "apps/web/src/lib/shop-profiles.ts",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
docker compose build web
docker compose up -d web nginx
sleep 8
echo "==> DONE — admin tenant onboarding includes business type"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
sftp = client.open_sftp()
for rel in FILES:
    sftp.put(os.path.join(ROOT, rel.replace("/", os.sep)), f"{DEPLOY_DIR}/{rel}")
    print(f"Uploaded {rel}")
with sftp.file("/tmp/deploy_admin_shoptype.sh", "w") as f:
    f.write(DEPLOY)
sftp.chmod("/tmp/deploy_admin_shoptype.sh", 0o755)
sftp.close()
_, stdout, _ = client.exec_command("bash /tmp/deploy_admin_shoptype.sh", timeout=900)
print(stdout.read().decode("utf-8", errors="replace"))
client.close()
