#!/usr/bin/env python3
import os, sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pwd = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
DEPLOY = r"""#!/bin/bash
set -e
cd /opt/fashionerp
git fetch origin main && git reset --hard origin/main
docker compose build --no-cache api
docker compose up -d --force-recreate api
sleep 25
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health
echo ""
docker ps --filter name=fashionerp_api --format '{{.Names}} {{.Status}}'
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=pwd, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/rebuild_api_nocache.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/rebuild_api_nocache.sh", 0o755)
_, o, e = c.exec_command("bash /tmp/rebuild_api_nocache.sh", timeout=900000)
out = o.read().decode()
print(out[-6000:] if len(out) > 6000 else out)
err = e.read().decode()
if err.strip() and '"status":"ok"' not in out:
    print("STDERR:", err[-2500:])
c.close()
