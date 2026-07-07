#!/usr/bin/env python3
"""Resume production deploy after docker conflict."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
REMOTE = "/opt/fashionerp"

DEPLOY = f"""#!/bin/bash
set -e
cd {REMOTE}
sleep 15
docker compose up -d api
sleep 8
docker compose build web
docker compose up -d web nginx
docker compose exec -u root -T api sh -c 'mkdir -p /app/uploads/.ssl-pending && chown -R nestjs:nodejs /app/uploads'
sleep 10
docker compose exec -u root -T api npx prisma db push --accept-data-loss
docker compose cp apps/api/prisma/seed.js api:/app/prisma/seed.js
docker compose exec -u root -T api node prisma/seed.js
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
echo "RESUME DEPLOY DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/resume_deploy.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/resume_deploy.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/resume_deploy.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-6000:])
c.close()
