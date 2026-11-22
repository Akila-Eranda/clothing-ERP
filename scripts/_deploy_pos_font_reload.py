#!/usr/bin/env python3
import sys, time, paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
ROOT = Path(r"E:\main ERP hexalyte")
DEPLOY = "/opt/fashionerp"
FILES = [
    "apps/web/src/components/pos/pos-reload-panel.tsx",
    "apps/web/src/components/pos/pos-overlay.tsx",
    "apps/web/src/lib/pos-ui-theme.ts",
    "apps/web/src/app/globals.css",
]

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
with c.open_sftp() as sftp:
    for rel in FILES:
        local = ROOT / rel
        remote = f"{DEPLOY}/{rel}"
        print("upload", rel)
        with open(local, "rb") as lf, sftp.file(remote, "wb") as rf:
            rf.write(lf.read())

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
    with sftp.file(f"{DEPLOY}/_deploy_pos_ui.sh", "w") as f:
        f.write(script)
    sftp.chmod(f"{DEPLOY}/_deploy_pos_ui.sh", 0o755)

stdin, stdout, stderr = c.exec_command(f"bash {DEPLOY}/_deploy_pos_ui.sh", timeout=900, get_pty=True)
stdout.channel.settimeout(900)
out = stdout.read().decode("utf-8", "replace")
print(out[-8000:] if len(out) > 8000 else out)
err = stderr.read().decode("utf-8", "replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
if "DEPLOY_OK" not in out:
    raise SystemExit(1)
