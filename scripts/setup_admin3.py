#!/usr/bin/env python3
"""Add admin3.hexalyte.com SSL + nginx on VPS."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
DEPLOY_DIR = "/opt/fashionerp"
EMAIL = "admin@demo.fashionerp.com"

NGINX_CLOTHING = open(r"e:\clothing shop\nginx\nginx.clothing.conf", encoding="utf-8").read()

SETUP = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

mkdir -p nginx/ssl/admin3.hexalyte.com

echo "==> Expand SSL cert to include admin3.hexalyte.com..."
docker compose stop nginx

certbot certonly --standalone \\
  -d shop.hexalyte.com \\
  -d shop.clothing.api.hexalyte.com \\
  -d admin3.hexalyte.com \\
  --non-interactive --agree-tos -m {EMAIL} \\
  --expand --force-renewal

echo "==> Copy certs..."
cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem nginx/ssl/shop.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem          nginx/ssl/shop.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem nginx/ssl/shop.clothing.api.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem          nginx/ssl/shop.clothing.api.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem nginx/ssl/admin3.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem          nginx/ssl/admin3.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem nginx/ssl/wildcard.shop.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem          nginx/ssl/wildcard.shop.hexalyte.com/

echo "==> Update nginx config..."
cat > nginx/nginx.clothing.conf << 'NGINXEOF'
{NGINX_CLOTHING}
NGINXEOF
cp nginx/nginx.clothing.conf nginx/nginx.conf

echo "==> Ensure ALLOWED_ORIGINS includes admin3..."
if ! grep -q admin3.hexalyte.com .env; then
  sed -i 's|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://shop.hexalyte.com,https://admin3.hexalyte.com,https://shop.clothing.api.hexalyte.com|' .env 2>/dev/null || \\
  echo 'ALLOWED_ORIGINS=https://shop.hexalyte.com,https://admin3.hexalyte.com,https://shop.clothing.api.hexalyte.com' >> .env
fi

docker compose up -d nginx api
sleep 5

echo "==> Verify admin3..."
curl -skI https://admin3.hexalyte.com/ | head -5
curl -skI https://admin3.hexalyte.com/admin | head -5
echo "==> DONE"
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

sftp = client.open_sftp()
with sftp.file("/tmp/setup_admin3.sh", "w") as f:
    f.write(SETUP)
sftp.chmod("/tmp/setup_admin3.sh", 0o755)
sftp.close()

_, stdout, stderr = client.exec_command("bash /tmp/setup_admin3.sh", timeout=600)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err)
sys.exit(stdout.channel.recv_exit_status())
