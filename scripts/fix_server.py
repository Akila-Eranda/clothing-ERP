"""Fix nginx and run migrations on remote server."""
import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
DEPLOY_DIR = "/opt/fashionerp"

NGINX_STANDALONE = open(r"e:\clothing shop\nginx\nginx.standalone.conf", encoding="utf-8").read()

FIX_SCRIPT = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

echo "==> Installing standalone nginx config..."
cat > nginx/nginx.standalone.conf << 'NGINXEOF'
{NGINX_STANDALONE}
NGINXEOF

# Use standalone config (no hexalyte upstreams)
cp nginx/nginx.standalone.conf nginx/nginx.conf

echo "==> Restarting nginx..."
docker compose restart nginx
sleep 5
docker compose ps nginx

echo "==> Running DB migrations..."
docker compose exec -T api npx prisma migrate deploy

echo "==> Seeding database..."
docker compose exec -T api npx prisma db seed || echo "Seed skipped"

echo "==> Health checks..."
curl -s http://localhost/api/health || true
echo ""
curl -s -o /dev/null -w "API health: %{{http_code}}\\n" http://localhost:3001/api/health
curl -s -o /dev/null -w "Web: %{{http_code}}\\n" http://localhost:3000
curl -s -o /dev/null -w "Nginx->Web: %{{http_code}}\\n" http://localhost/

echo "==> DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

sftp = c.open_sftp()
with sftp.file("/tmp/fix_clothing.sh", "w") as f:
    f.write(FIX_SCRIPT)
sftp.chmod("/tmp/fix_clothing.sh", 0o755)
sftp.close()

_, stdout, stderr = c.exec_command("bash /tmp/fix_clothing.sh", timeout=600)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print(out)
if err.strip():
    print("STDERR:", err)
print("Exit:", stdout.channel.recv_exit_status())
c.close()
