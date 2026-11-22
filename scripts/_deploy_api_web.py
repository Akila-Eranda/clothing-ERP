#!/usr/bin/env python3
import sys
from _ssh_config import ssh_connect_kwargs
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)

script = """#!/bin/bash
set -e
cd /opt/fashionerp
git fetch origin main
git reset --hard origin/main
docker compose build api web
docker compose up -d --force-recreate --no-deps api web nginx
sleep 10
docker compose ps api web nginx
curl -s -o /dev/null -w "login:%{http_code}\\n" https://grocery.shop.hexalyte.com/login
echo DEPLOY_OK
"""

stdin, stdout, stderr = c.exec_command("bash -s", timeout=1200)
stdin.write(script)
stdin.channel.shutdown_write()
out = stdout.read().decode("utf-8", "replace")
err = stderr.read().decode("utf-8", "replace")
print(out[-5000:] if len(out) > 5000 else out)
if err.strip():
    print("STDERR:", err[-2500:])
code = stdout.channel.recv_exit_status()
c.close()
if code != 0 or "DEPLOY_OK" not in out:
    raise SystemExit(code or 1)
