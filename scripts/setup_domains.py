#!/usr/bin/env python3
"""Configure SSL + domain nginx for clothing ERP on VPS."""
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
export DEBIAN_FRONTEND=noninteractive
cd {DEPLOY_DIR}

echo "==> Install certbot..."
apt-get update -qq
apt-get install -y -qq certbot

mkdir -p nginx/ssl/shop.hexalyte.com
mkdir -p nginx/ssl/shop.clothing.api.hexalyte.com
mkdir -p nginx/ssl/wildcard.shop.hexalyte.com

echo "==> Stop nginx for certbot standalone..."
docker compose stop nginx

echo "==> Request SSL certs..."
certbot certonly --standalone \\
  -d shop.hexalyte.com \\
  -d shop.clothing.api.hexalyte.com \\
  --non-interactive --agree-tos -m {EMAIL} \\
  --preferred-challenges http

echo "==> Copy certs to nginx ssl folder..."
cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem nginx/ssl/shop.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem          nginx/ssl/shop.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem nginx/ssl/shop.clothing.api.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem          nginx/ssl/shop.clothing.api.hexalyte.com/
# Wildcard subdomains need DNS challenge — reuse main cert for now
cp /etc/letsencrypt/live/shop.hexalyte.com/fullchain.pem nginx/ssl/wildcard.shop.hexalyte.com/
cp /etc/letsencrypt/live/shop.hexalyte.com/privkey.pem          nginx/ssl/wildcard.shop.hexalyte.com/

echo "==> Write nginx clothing config..."
cat > nginx/nginx.clothing.conf << 'NGINXEOF'
{NGINX_CLOTHING}
NGINXEOF
cp nginx/nginx.clothing.conf nginx/nginx.conf

echo "==> Start nginx..."
docker compose up -d nginx
sleep 5

echo "==> Verify HTTPS..."
curl -skI https://shop.hexalyte.com/ | head -4
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 250
echo ""
docker compose ps

echo "==> DONE"
"""


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    sftp = client.open_sftp()
    with sftp.file("/tmp/setup_domains.sh", "w") as f:
        f.write(SETUP)
    sftp.chmod("/tmp/setup_domains.sh", 0o755)
    sftp.close()

    _, stdout, stderr = client.exec_command("bash /tmp/setup_domains.sh", timeout=600)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    print(out)
    if err.strip():
        print("STDERR:", err)
    code = stdout.channel.recv_exit_status()
    client.close()
    sys.exit(code)


if __name__ == "__main__":
    main()
