#!/usr/bin/env python3
import sys, time, paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
DEPLOY = "/opt/fashionerp"

def connect():
    last = None
    for i in range(5):
        try:
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
            return c
        except Exception as e:
            last = e
            print("retry", i + 1, e)
            time.sleep(2)
    raise last

c = connect()
print("connected")
script = f"""#!/bin/bash
set -e
cd {DEPLOY}
git fetch origin main
git reset --hard origin/main
docker compose build web
docker compose up -d --force-recreate --no-deps web
sleep 10
docker compose ps web
echo DEPLOY_OK
"""
with c.open_sftp() as sftp:
    with sftp.file(f"{DEPLOY}/_deploy_inventory_layout.sh", "w") as f:
        f.write(script)
    sftp.chmod(f"{DEPLOY}/_deploy_inventory_layout.sh", 0o755)

stdin, stdout, stderr = c.exec_command(f"bash {DEPLOY}/_deploy_inventory_layout.sh", timeout=900, get_pty=True)
stdout.channel.settimeout(900)
out = stdout.read().decode("utf-8", "replace")
print(out[-6000:] if len(out) > 6000 else out)
c.close()
if "DEPLOY_OK" not in out:
    raise SystemExit(1)
