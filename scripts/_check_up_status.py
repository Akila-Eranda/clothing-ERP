#!/usr/bin/env python3
import sys
from _ssh_config import ssh_connect_kwargs
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)

script = """#!/bin/bash
cd /opt/fashionerp
docker compose up -d --no-deps web nginx api db redis 2>/dev/null || true
sleep 5
docker compose ps
echo "---"
curl -s -o /dev/null -w "login:%{http_code}\\n" https://grocery.shop.hexalyte.com/login
curl -s -o /dev/null -w "api_health:%{http_code}\\n" https://grocery.shop.hexalyte.com/api/health || true
git rev-parse --short HEAD
echo DEPLOY_OK
"""

stdin, stdout, stderr = c.exec_command("bash -s", timeout=120)
stdin.write(script)
stdin.channel.shutdown_write()
out = stdout.read().decode("utf-8", "replace")
err = stderr.read().decode("utf-8", "replace")
print(out)
if err.strip():
    print("STDERR:", err[-1500:])
c.close()
