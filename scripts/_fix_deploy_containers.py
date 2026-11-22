#!/usr/bin/env python3
import os, sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pwd = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
FIX = r"""#!/bin/bash
set -e
cd /opt/fashionerp
echo "==> Build API..."
docker compose build api
echo "==> Restart services..."
docker compose up -d api web nginx
sleep 12
echo "==> Health..."
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep fashionerp
echo RESTART_DONE
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=pwd, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/restart_stack.sh", "w") as f:
        f.write(FIX)
    sftp.chmod("/tmp/restart_stack.sh", 0o755)
_, o, e = c.exec_command("bash /tmp/restart_stack.sh", timeout=900000)
out = o.read().decode()
print(out[-10000:] if len(out) > 10000 else out)
err = e.read().decode()
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
