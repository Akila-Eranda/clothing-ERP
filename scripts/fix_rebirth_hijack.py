#!/usr/bin/env python3
"""Investigate reinfection + emergency clean rebuild of web."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
ROOT = r"e:\clothing shop"
REMOTE = "/opt/fashionerp"

FILES = [
    "apps/web/src/middleware.ts",
    "apps/web/next.config.ts",
    "apps/web/Dockerfile",
    "nginx/nginx.clothing.conf",
]

SCRIPT = f"""#!/bin/bash
set -e
cd {REMOTE}

echo "=== WHO redirects? ==="
curl -sI --connect-timeout 5 -H 'Host: shop.hexalyte.com' http://127.0.0.1:3000/login | head -15 || true
curl -sI --connect-timeout 5 https://127.0.0.1/login -H 'Host: shop.hexalyte.com' -k | head -15 || true

echo ""
echo "=== persistence checks ==="
crontab -l 2>/dev/null || true
grep -R 'rebirthstress\\|return\\.st\\|ref=NEXT' /etc/cron* /var/spool/cron 2>/dev/null | head -20 || true
ls -la /opt/fashionerp/apps/web/src/middleware.ts
md5sum /opt/fashionerp/apps/web/src/middleware.ts || true
docker compose exec -T web sh -c 'wget -qS -O /dev/null http://127.0.0.1:3000/login 2>&1 | head -20' || true

echo ""
echo "=== suspicious host processes / docker ==="
docker ps --format 'table {{{{.Names}}}}\\t{{{{.Image}}}}\\t{{{{.Status}}}}\\t{{{{.CreatedAt}}}}'
ps aux | grep -Ei 'curl|wget|node|python|nginx' | grep -v grep | head -40

echo ""
echo "=== look for rebirthstress string in web container ==="
docker compose exec -T web sh -c 'find /app -type f ! -path "*/node_modules/*" -print0 2>/dev/null | xargs -0 grep -lF "rebirthstress" 2>/dev/null | head -30' || echo none

echo ""
echo "=== FORCE clean rebuild web + recreate ==="
docker compose stop web
docker compose rm -f web
docker rmi fashionerp-web:latest || true
docker compose build --no-cache --pull web
docker compose up -d --force-recreate web nginx
sleep 15

echo "=== VERIFY ==="
for url in 'http://127.0.0.1:3000/login' 'https://shop.hexalyte.com/login' 'https://sl-deen-supermarket.shop.hexalyte.com/login'; do
  echo "--- $url ---"
  if [[ "$url" == http://* ]]; then
    curl -sI --connect-timeout 8 -H 'Host: shop.hexalyte.com' "$url" | head -12
  else
    curl -sI --connect-timeout 10 "$url" | head -12
  fi
done
echo CLEAN_REBUILD_DONE
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.isfile(local):
            print("skip", rel)
            continue
        remote = f"{REMOTE}/{rel}"
        print("upload", rel)
        # ensure dirs
        parts = os.path.dirname(remote).split("/")
        path = ""
        for p in parts:
            if not p:
                continue
            path += "/" + p
            try:
                sftp.stat(path)
            except FileNotFoundError:
                try:
                    sftp.mkdir(path)
                except OSError:
                    pass
        sftp.put(local, remote)

    with sftp.file("/tmp/fix_rebirth_hijack.sh", "w") as f:
        f.write(SCRIPT)
    sftp.chmod("/tmp/fix_rebirth_hijack.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/fix_rebirth_hijack.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-6000:])
c.close()
