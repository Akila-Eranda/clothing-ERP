#!/usr/bin/env python3
"""Diagnose + fix SSL for hexaadmin.hexalyte.com."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
REMOTE = "/opt/fashionerp"
EMAIL = "admin@hexalyte.com"
DOMAIN = "hexaadmin.hexalyte.com"

# Snippet inserted into nginx.clothing.conf (before final closing braces of http{})
HEXAADMIN_BLOCK = r"""
    # ── Invoice Admin: hexaadmin.hexalyte.com ─────────────────────
    server {
        listen 443 ssl;
        server_name hexaadmin.hexalyte.com;

        ssl_certificate     /etc/nginx/ssl/hexaadmin.hexalyte.com/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/hexaadmin.hexalyte.com/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        client_max_body_size 50M;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Strict-Transport-Security "max-age=31536000" always;

        location / {
            set $invoice hexalyte-invoice-app;
            proxy_pass http://$invoice:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_cache_bypass $http_upgrade;
        }
    }
"""

FIX = f"""#!/bin/bash
set -e
cd {REMOTE}

echo "=== DNS ==="
dig +short A {DOMAIN} || true
getent hosts {DOMAIN} || true

echo "=== Current SNI cert ==="
echo | openssl s_client -connect {DOMAIN}:443 -servername {DOMAIN} 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName 2>/dev/null | head -20 || true

echo "=== Grep hexaadmin in nginx ==="
grep -n hexaadmin nginx/nginx.clothing.conf || echo 'not present'

echo "==> Stop nginx for certbot standalone"
docker compose stop nginx

echo "==> Issue Let's Encrypt cert for {DOMAIN}"
certbot certonly --standalone \\
  -d {DOMAIN} \\
  --non-interactive --agree-tos -m {EMAIL} \\
  --cert-name {DOMAIN} \\
  --force-renewal

mkdir -p nginx/ssl/{DOMAIN}
cp /etc/letsencrypt/live/{DOMAIN}/fullchain.pem nginx/ssl/{DOMAIN}/fullchain.pem
cp /etc/letsencrypt/live/{DOMAIN}/privkey.pem nginx/ssl/{DOMAIN}/privkey.pem
chmod 644 nginx/ssl/{DOMAIN}/fullchain.pem
chmod 600 nginx/ssl/{DOMAIN}/privkey.pem

echo "==> Patch nginx config"
python3 /tmp/patch_hexaadmin_nginx.py

# HTTP catch-all server_name
sed -i 's/server_name shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com \\*\\.shop.hexalyte.com;/server_name shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com hexaadmin.hexalyte.com *.shop.hexalyte.com;/' nginx/nginx.clothing.conf || true

echo "==> Connect invoice container to compose network"
NET=$(docker inspect fashionerp_nginx -f '{{{{range $k,$v := .NetworkSettings.Networks}}}}{{{{$k}}}}{{{{end}}}}' 2>/dev/null | head -1)
echo "nginx network=$NET"
if [[ -n "$NET" ]]; then
  docker network connect "$NET" hexalyte-invoice-app 2>/dev/null || true
fi

docker compose up -d nginx
sleep 5
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload || true

echo "==> Verify"
echo | openssl s_client -connect {DOMAIN}:443 -servername {DOMAIN} 2>/dev/null | openssl x509 -noout -subject -dates -ext subjectAltName | head -25
curl -sI --connect-timeout 15 https://{DOMAIN}/invoices | head -20
echo HEXAADMIN_SSL_DONE
"""

PATCH_PY = r'''#!/usr/bin/env python3
from pathlib import Path
conf = Path("/opt/fashionerp/nginx/nginx.clothing.conf")
block = Path("/tmp/hexaadmin_server_block.conf").read_text()
text = conf.read_text()
if "server_name hexaadmin.hexalyte.com" in text:
    print("hexaadmin block already exists — leaving conf")
else:
    # Insert before the final closing brace of the http { } block
    # File structure: ... }\n}\n  (http close then maybe nothing)
    stripped = text.rstrip() + "\n"
    if stripped.endswith("}\n"):
        # remove last }
        body = stripped[:-2]
        conf.write_text(body + block + "}\n")
        print("inserted hexaadmin block before final }")
    else:
        conf.write_text(text + "\n" + block)
        print("appended hexaadmin block")
'''

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    with sftp.file("/tmp/hexaadmin_server_block.conf", "w") as f:
        f.write(HEXAADMIN_BLOCK)
    with sftp.file("/tmp/patch_hexaadmin_nginx.py", "w") as f:
        f.write(PATCH_PY)
    sftp.chmod("/tmp/patch_hexaadmin_nginx.py", 0o755)
    with sftp.file("/tmp/fix_hexaadmin_ssl.sh", "w") as f:
        f.write(FIX)
    sftp.chmod("/tmp/fix_hexaadmin_ssl.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/fix_hexaadmin_ssl.sh", timeout=600000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-8000:])
c.close()
