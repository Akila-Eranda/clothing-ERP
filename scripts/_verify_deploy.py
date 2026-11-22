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
docker compose exec -T api npx prisma migrate deploy
curl -s -o /dev/null -w "login:%{http_code}\\n" https://grocery.shop.hexalyte.com/login
curl -s -o /dev/null -w "products:%{http_code}\\n" https://grocery.shop.hexalyte.com/products/new
echo VERIFY_OK
"""

stdin, stdout, stderr = c.exec_command("bash -s", timeout=120)
stdin.write(script)
stdin.channel.shutdown_write()
print(stdout.read().decode("utf-8", "replace"))
print(stderr.read().decode("utf-8", "replace")[-1000:])
c.close()
