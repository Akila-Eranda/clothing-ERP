#!/usr/bin/env python3
"""Quick deploy: web + nginx only (HTTPS headers)."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
DEPLOY_DIR = "/opt/fashionerp"

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
git fetch origin main
git reset --hard origin/main
docker compose build web
docker compose up -d web nginx
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
echo "Deployed web + nginx"
curl -sI https://jo-lanka.shop.hexalyte.com/dashboard | head -6
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/quick_deploy.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/quick_deploy.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/quick_deploy.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
