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
docker compose exec -T api npx prisma migrate resolve --applied 20260730_pos_reload_recharge || true
docker compose exec -T api npx prisma migrate deploy
docker compose ps api web nginx
curl -s -o /dev/null -w "web:%{http_code}\\n" https://grocery.shop.hexalyte.com/login || true
echo MIGRATE_OK
"""

stdin, stdout, stderr = c.exec_command("bash -s", timeout=300)
stdin.write(script)
stdin.channel.shutdown_write()
out = stdout.read().decode("utf-8", "replace")
err = stderr.read().decode("utf-8", "replace")
print(out)
if err.strip():
    print("STDERR:", err[-1500:])
code = stdout.channel.recv_exit_status()
c.close()
print("exit", code)
if code != 0 or "MIGRATE_OK" not in out:
    raise SystemExit(1)
