#!/usr/bin/env python3
"""Find who injects redirect to return.st."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

SCRIPT = r"""#!/bin/bash
set +e
cd /opt/fashionerp

echo "=== grep return.st on host ==="
grep -Rn "return.st" /opt/fashionerp 2>/dev/null | head -50 || echo none

echo ""
echo "=== nginx config Location/return lines ==="
grep -nE "return\.st|return 30|rewrite |proxy_pass" nginx/nginx.clothing.conf | head -80

echo ""
echo "=== nginx container actual conf ==="
docker compose exec -T nginx sh -c 'grep -nE "return\.st|return 30|rewrite |proxy_pass|location /" /etc/nginx/nginx.conf' | head -100

echo ""
echo "=== Web direct:3000 ==="
curl -sI --connect-timeout 8 -H 'Host: shop.hexalyte.com' http://127.0.0.1:3000/ | head -25
echo "----"
curl -sI --connect-timeout 8 -H 'Host: general.shop.hexalyte.com' http://127.0.0.1:3000/login | head -25

echo ""
echo "=== API health direct:3001 ==="
curl -sk --connect-timeout 8 http://127.0.0.1:3001/api/v1/health | head -c 250; echo

echo ""
echo "=== nginx.conf mtime / md5 ==="
ls -la nginx/nginx.clothing.conf
md5sum nginx/nginx.clothing.conf 2>/dev/null || md5 nginx/nginx.clothing.conf 2>/dev/null

echo ""
echo "=== search return.st in web/api containers ==="
docker compose exec -T web sh -c 'grep -R "return.st" /app 2>/dev/null | head -20' || echo web-none
docker compose exec -T api sh -c 'grep -R "return.st" /app 2>/dev/null | head -20' || echo api-none

echo ""
echo "=== iptables / unexpected listeners? ==="
ss -lntp | head -40
iptables -t nat -L -n 2>/dev/null | head -40 || true
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/find_redirect.sh", "w") as f:
        f.write(SCRIPT)
    sftp.chmod("/tmp/find_redirect.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/find_redirect.sh", timeout=180000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-4000:])
c.close()
