#!/usr/bin/env python3
"""Full production compromise scan for stresser redirect reinfection."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

SCRIPT = r'''#!/bin/bash
set +e
cd /opt/fashionerp
OUT=/tmp/fashionerp_security_scan.txt
exec > >(tee "$OUT") 2>&1

echo "======== FASHIONERP SECURITY SCAN $(date -u) ========"

echo ""
echo "=== 1. CURRENT REDIRECT CHECK ==="
for host in shop.hexalyte.com sl-deen-supermarket.shop.hexalyte.com; do
  echo "--- $host ---"
  curl -sI --connect-timeout 8 "https://$host/login" | head -12
done
echo "--- web:3000 ---"
curl -sI --connect-timeout 5 -H 'Host: shop.hexalyte.com' http://127.0.0.1:3000/login | head -12

echo ""
echo "=== 2. DOCKER CONTAINERS / IMAGES ==="
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}'
echo
docker images | head -30

echo ""
echo "=== 3. CRON (system + users) ==="
echo "-- /etc/crontab --"
cat /etc/crontab 2>/dev/null
echo "-- /etc/cron.d --"
ls -la /etc/cron.d 2>/dev/null
for f in /etc/cron.d/*; do echo "FILE $f"; cat "$f"; echo; done 2>/dev/null
echo "-- root crontab --"
crontab -l 2>/dev/null
echo "-- other user crontabs --"
for u in $(cut -f1 -d: /etc/passwd); do
  ct=$(crontab -u "$u" -l 2>/dev/null) || continue
  echo "USER $u"; echo "$ct"; echo
done
ls -la /var/spool/cron/crontabs 2>/dev/null

echo ""
echo "=== 4. systemd timers / suspicious services ==="
systemctl list-timers --all 2>/dev/null | head -40
systemctl list-units --type=service --state=running 2>/dev/null | head -60

echo ""
echo "=== 5. AUTHORIZED KEYS / USERS ==="
echo "-- root authorized_keys --"
cat /root/.ssh/authorized_keys 2>/dev/null
echo "-- /home/*/authorized_keys --"
ls -la /home/*/.ssh/authorized_keys 2>/dev/null
for f in /home/*/.ssh/authorized_keys; do echo "FILE $f"; cat "$f"; done 2>/dev/null
echo "-- users with shell --"
grep -E '/bin/(bash|sh|zsh)' /etc/passwd
echo "-- last logins --"
last -n 30 2>/dev/null
echo "-- failed ssh recent --"
journalctl -u ssh --since "7 days ago" 2>/dev/null | grep -i 'Failed\|Accepted\|Invalid' | tail -40

echo ""
echo "=== 6. SEARCH STRESSER / REDIRECT IOC ==="
for pat in 'rebirthstress' 'return.st' 'DiamWall' 'ref=NEXT' 'ref=Q7hw' 'stresser' 'booter'; do
  echo "---- pattern: $pat ----"
  grep -RsnF --binary-files=without-match "$pat" /opt/fashionerp /etc /var/spool/cron /root /home 2>/dev/null | head -40
done

echo ""
echo "=== 7. WEB CONTAINER FILE ANOMALIES ==="
docker compose exec -T web sh -c 'ls -la /app /app/.next /app/.next/server/src 2>/dev/null'
docker compose exec -T web sh -c 'md5sum /app/server.js /app/.next/server/src/middleware.js 2>/dev/null'
docker compose exec -T web sh -c 'find /app -type f ! -path "*/node_modules/*" -mtime -2 -printf "%T+ %p\n" 2>/dev/null | sort | tail -40'
docker compose exec -T web sh -c 'find /app -type f ! -path "*/node_modules/*" \( -name "*stress*" -o -name "*hack*" -o -name "*inject*" \) 2>/dev/null'
docker compose exec -T web sh -c 'grep -RsnF --binary-files=without-match "rebirthstress\|return.st\|DiamWall\|ref=NEXT" /app --exclude-dir=node_modules 2>/dev/null | head -40'

echo ""
echo "=== 8. HOST FILE CHANGES LAST 3 DAYS under /opt/fashionerp ==="
find /opt/fashionerp -type f -mtime -3 -printf '%T+ %p\n' 2>/dev/null | sort | tail -80

echo ""
echo "=== 9. LISTENING PORTS / UNUSUAL PROCS ==="
ss -lntp
echo
ps auxf | head -100

echo ""
echo "=== 10. DOCKER VOLUMES / MOUNTS for web ==="
docker inspect fashionerp_web --format '{{json .Mounts}}' 2>/dev/null | python3 -m json.tool 2>/dev/null || docker inspect fashionerp_web --format '{{json .Mounts}}'
docker inspect fashionerp_web --format '{{.Path}} {{.Args}}' 2>/dev/null
docker inspect fashionerp_web --format '{{json .HostConfig.Binds}}'
docker top fashionerp_web 2>/dev/null

echo ""
echo "=== 11. NGINX CONF integrity ==="
md5sum /opt/fashionerp/nginx/nginx.clothing.conf
grep -nE 'rebirth|return\.st|proxy_pass|rewrite|return 30' /opt/fashionerp/nginx/nginx.clothing.conf | head -60
docker compose exec -T nginx sh -c 'grep -nE "rebirth|return\.st|rewrite|return 30" /etc/nginx/nginx.conf | head -40'

echo ""
echo "=== 12. WORLD-WRITABLE / suspicious binaries ==="
find /opt/fashionerp /tmp /var/tmp -type f -perm -0002 2>/dev/null | head -40
ls -la /tmp /var/tmp 2>/dev/null | head -50
find /tmp /var/tmp -type f -mtime -7 2>/dev/null | head -40

echo ""
echo "=== 13. NETWORK CONNECTIONS from web/api ==="
ss -antp | grep -E '3000|3001|ESTAB' | head -50

echo ""
echo "=== 14. INVOICE APP check ==="
curl -sI --connect-timeout 5 http://127.0.0.1:3000/ 2>/dev/null | head -10
docker ps --filter name=invoice --format '{{.Names}} {{.Ports}} {{.Status}}'
docker inspect hexalyte-invoice-app --format '{{json .HostConfig.PortBindings}}' 2>/dev/null

echo ""
echo "=== 15. git status / unexpected edits on server ==="
cd /opt/fashionerp
git status -sb 2>/dev/null | head -50
git log -5 --oneline 2>/dev/null

echo "======== SCAN COMPLETE ========"
'''

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/full_security_scan.sh", "w") as f:
        f.write(SCRIPT)
    sftp.chmod("/tmp/full_security_scan.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/full_security_scan.sh", timeout=300000)
out = stdout.read().decode("utf-8", errors="replace")
# write local copy
with open(r"e:\clothing shop\scripts\security_scan_result.txt", "w", encoding="utf-8", errors="replace") as f:
    f.write(out)
print(out[:35000])
if len(out) > 35000:
    print(f"\n...[truncated, full saved to scripts/security_scan_result.txt, total {len(out)} chars]...")
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
