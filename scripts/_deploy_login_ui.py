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
docker compose build web
docker compose up -d --force-recreate --no-deps web nginx
sleep 6
docker compose ps web nginx
curl -s -o /dev/null -w "login:%{http_code}\\n" https://grocery.shop.hexalyte.com/login
echo DEPLOY_OK
"""

stdin, stdout, stderr = c.exec_command("bash -s", timeout=600)
stdin.write(script)
stdin.channel.shutdown_write()
out = stdout.read().decode("utf-8", "replace")
print(out[-4000:] if len(out) > 4000 else out)
code = stdout.channel.recv_exit_status()
c.close()
if code != 0 or "DEPLOY_OK" not in out:
    raise SystemExit(1)
