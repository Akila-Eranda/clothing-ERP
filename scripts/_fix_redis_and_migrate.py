#!/usr/bin/env python3
import sys, secrets, string
from _ssh_config import ssh_connect_kwargs
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)

new_pw = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))

script = f"""#!/bin/bash
set -e
cd /opt/fashionerp
if grep -q '^REDIS_PASSWORD=redis_secret$' .env; then
  sed -i 's/^REDIS_PASSWORD=redis_secret$/REDIS_PASSWORD={new_pw}/' .env
  echo UPDATED_REDIS_PASSWORD=yes
else
  echo UPDATED_REDIS_PASSWORD=no
fi
docker compose up -d redis
sleep 3
docker compose up -d --force-recreate api
sleep 8
docker compose exec -T api npx prisma migrate resolve --applied 20260730_pos_reload_recharge || true
docker compose exec -T api npx prisma migrate deploy || true
docker compose ps api web nginx
docker compose logs api --tail 15
curl -s -o /dev/null -w "web:%{{http_code}}\\n" https://grocery.shop.hexalyte.com/login || true
echo FIX_OK
"""

stdin, stdout, stderr = c.exec_command("bash -s", timeout=300)
stdin.write(script)
stdin.channel.shutdown_write()
out = stdout.read().decode("utf-8", "replace")
err = stderr.read().decode("utf-8", "replace")
print(out)
if err.strip():
    print("STDERR:", err[-2000:])
code = stdout.channel.recv_exit_status()
c.close()
print("exit", code)
if code != 0 or "FIX_OK" not in out:
    raise SystemExit(1)
