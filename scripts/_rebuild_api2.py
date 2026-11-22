#!/usr/bin/env python3
import os, sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pwd = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
DEPLOY = r"""#!/bin/bash
set -e
cd /opt/fashionerp
git fetch origin main && git reset --hard origin/main
git log -1 --oneline
docker compose build api
docker compose up -d api
sleep 12
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo API_OK
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=pwd, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/rebuild_api2.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/rebuild_api2.sh", 0o755)
_, o, e = c.exec_command("bash /tmp/rebuild_api2.sh", timeout=900000)
out = o.read().decode()
print(out[-5000:] if len(out) > 5000 else out)
err = e.read().decode()
if err.strip() and "API_OK" not in out:
    print("STDERR:", err[-2000:])
c.close()
