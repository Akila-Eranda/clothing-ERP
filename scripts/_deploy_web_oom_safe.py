#!/usr/bin/env python3
"""OOM-safe web deploy: prune builders, then build web + restart nginx."""
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

echo "==> Sync git (retry on DNS blips)..."
for i in 1 2 3 4 5; do
  if git fetch origin main; then
    git reset --hard origin/main
    break
  fi
  echo "fetch failed (try $i), sleeping..."
  sleep 5
  if [ "$i" = "5" ]; then
    echo "WARNING: keep existing checkout @ $(git log -1 --oneline)"
  fi
done
git log -1 --oneline

echo "==> Free Docker build pressure..."
docker builder prune -af || true
docker image prune -f || true
# stop unused containers pressure
docker system df || true
sync
echo 3 > /proc/sys/vm/drop_caches || true
free -h | head -3

echo "==> Build web (serial, with cache if possible)..."
COMPOSE_PARALLEL_LIMIT=1 docker compose build web

echo "==> Restart web + nginx..."
docker compose up -d --force-recreate web
docker compose up -d nginx
sleep 12
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload

echo "Deployed web + nginx @ $(git log -1 --oneline)"
curl -sI https://jo-lanka.shop.hexalyte.com/dashboard | head -8
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/oom_safe_deploy.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/oom_safe_deploy.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/oom_safe_deploy.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-4000:])
c.close()
