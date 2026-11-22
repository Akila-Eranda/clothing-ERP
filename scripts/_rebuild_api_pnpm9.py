#!/usr/bin/env python3
import os, sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pwd = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
DEPLOY = r"""#!/bin/bash
set -e
cd /opt/fashionerp
# Pin pnpm 9 — pnpm 10 blocks native builds in Docker without approve-builds
sed -i 's/npm install -g pnpm/npm install -g pnpm@9.15.9/g' apps/api/Dockerfile
grep 'pnpm@' apps/api/Dockerfile | head -2
echo "==> Build API only..."
docker compose build api
docker compose up -d api
sleep 12
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo API_REBUILD_DONE
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=pwd, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/rebuild_api.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/rebuild_api.sh", 0o755)
_, o, e = c.exec_command("bash /tmp/rebuild_api.sh", timeout=900000)
out = o.read().decode()
print(out[-8000:] if len(out) > 8000 else out)
err = e.read().decode()
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
