#!/usr/bin/env python3
import sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
FIX = """#!/bin/bash
set -e
cd /opt/fashionerp
git pull origin main
docker compose build web
docker compose up -d web nginx
echo DONE
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=r"pwrU\r*UGS£?8H2V$8]<qT", timeout=30)
with c.open_sftp() as s:
    with s.file("/tmp/rebuild_web.sh", "w") as f: f.write(FIX)
    s.chmod("/tmp/rebuild_web.sh", 0o755)
_, o, e = c.exec_command("bash /tmp/rebuild_web.sh", timeout=900)
print(o.read().decode("utf-8", errors="replace")[-3000:])
c.close()
