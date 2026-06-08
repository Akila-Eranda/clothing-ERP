#!/usr/bin/env python3
"""Deploy refresh token fix to production."""
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
    "apps/api/src/modules/auth/auth.service.ts",
    "apps/api/src/app.module.ts",
    "apps/api/prisma/seed.js",
    "apps/web/src/lib/api.ts",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
docker compose build api
docker compose up -d api
sleep 12
docker compose exec -u root -T api node prisma/seed.js
bash /tmp/test_refresh.sh
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

sftp = client.open_sftp()
for rel in FILES:
    local = os.path.join(ROOT, rel.replace("/", os.sep))
    remote = f"{DEPLOY_DIR}/{rel}"
    sftp.put(local, remote)
    print(f"Uploaded {rel}")

with open(os.path.join(ROOT, "scripts", "test_refresh.sh")) as f:
    sftp.file("/tmp/test_refresh.sh", "w").write(f.read())
sftp.chmod("/tmp/test_refresh.sh", 0o755)

with sftp.file("/tmp/deploy_refresh_fix.sh", "w") as f:
    f.write(DEPLOY)
sftp.chmod("/tmp/deploy_refresh_fix.sh", 0o755)
sftp.close()

_, stdout, stderr = client.exec_command("bash /tmp/deploy_refresh_fix.sh", timeout=900)
print(stdout.read().decode("utf-8", errors="replace"))
if stderr.read().strip():
    print("STDERR:", stderr.read().decode("utf-8", errors="replace"))
