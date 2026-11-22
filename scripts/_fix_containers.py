#!/usr/bin/env python3
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

DEPLOY = """#!/bin/bash
set -e
cd /opt/fashionerp
# Clear orphaned rename leftovers from interrupted recreate
docker ps -a --format '{{.ID}} {{.Names}}' | awk '/fashionerp_(api|web)/{print $1}' | xargs -r docker rm -f
docker compose up -d api web nginx
sleep 10
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo
curl -sI https://grocery.shop.hexalyte.com/accounting/journals | head -5
echo "Containers fixed"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/fix_containers.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/fix_containers.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/fix_containers.sh", timeout=180)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-2500:])
c.close()
