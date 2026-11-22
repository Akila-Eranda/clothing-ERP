#!/usr/bin/env python3
"""Diagnostic ONLY (no changes): find who serves the 307 -> d-stat.net redirect."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

SCRIPT = r"""#!/bin/bash
set +e
cd /opt/fashionerp

echo "=== A) nginx upstream / resolver / set \$web / map ==="
grep -nE 'set \$web|set \$api|resolver|upstream|map |proxy_pass|server_name|add_header|return 30' nginx/nginx.clothing.conf | head -80

echo ""
echo "=== B) nginx container: resolve 'web' and 'api' names ==="
docker exec fashionerp_nginx sh -c 'nslookup web 2>/dev/null; getent hosts web; getent hosts api; getent hosts fashionerp_web' 2>&1 | head -40

echo ""
echo "=== C) Probe from INSIDE nginx container ==="
for tgt in 'http://web:3000/login' 'http://fashionerp_web:3000/login' 'http://api:3001/api/v1/health'; do
  echo "--- $tgt (Host shop.hexalyte.com) ---"
  docker exec fashionerp_nginx sh -c "wget -S -qO /dev/null --header='Host: shop.hexalyte.com' '$tgt' 2>&1 | sed 's/^/   /' | head -20"
done

echo ""
echo "=== D) fashionerp_web direct (its own docker IP) ==="
WEBIP=$(docker inspect fashionerp_web --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null)
echo "web container IPs: $WEBIP"
for ip in $WEBIP; do
  echo "--- http://$ip:3000/login ---"
  docker exec fashionerp_nginx sh -c "wget -S -qO /dev/null --header='Host: shop.hexalyte.com' 'http://$ip:3000/login' 2>&1 | sed 's/^/   /' | head -18"
done

echo ""
echo "=== E) invoice-app container details (also on :3000) ==="
docker inspect hexalyte-invoice-app --format 'IPs: {{range .NetworkSettings.Networks}}{{.NetworkID}}={{.IPAddress}} {{end}}' 2>/dev/null
echo "--- probe invoice app root ---"
INVIP=$(docker inspect hexalyte-invoice-app --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null)
for ip in $INVIP; do
  echo "--- http://$ip:3000/ ---"
  docker exec fashionerp_nginx sh -c "wget -S -qO /dev/null 'http://$ip:3000/' 2>&1 | sed 's/^/   /' | head -14" 2>&1 || echo "   (nginx can't reach $ip — different network)"
done

echo ""
echo "=== F) which docker networks + who is on them ==="
for net in $(docker network ls --format '{{.Name}}'); do
  members=$(docker network inspect "$net" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null)
  echo "$net -> $members"
done

echo ""
echo "=== G) grep d-stat / redirect INSIDE web container /app (limited) ==="
docker exec fashionerp_web sh -c 'grep -rlF "d-stat" /app 2>/dev/null | head; grep -rlF "d_stat" /app 2>/dev/null | head; grep -rlnE "https?://[a-z0-9.-]*stat" /app/server.js /app/.next/server/src/middleware.js 2>/dev/null | head' 2>&1 | head -30
echo "--- server.js head ---"
docker exec fashionerp_web sh -c 'head -40 /app/server.js' 2>&1 | head -45

echo ""
echo "=== H) web container env (redirect vars?) ==="
docker inspect fashionerp_web --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -iE 'redirect|url|host|stat|next_public' | head -30

echo ""
echo "=== I) nginx container image + any mounted extra confs ==="
docker inspect fashionerp_nginx --format '{{.Config.Image}}' 2>/dev/null
docker exec fashionerp_nginx sh -c 'ls -la /etc/nginx/conf.d/ 2>/dev/null; echo "--- included files ---"; grep -rn "include" /etc/nginx/nginx.conf | head; echo "--- any d-stat in container conf ---"; grep -rnE "d-stat|307|return 30|stat" /etc/nginx/ 2>/dev/null | head -30'

echo ""
echo "=== J) DNS: what does the domain resolve to (from server) ==="
for d in shop.hexalyte.com jo-lanka.shop.hexalyte.com d-stat.net; do
  echo "--- $d ---"; getent hosts "$d"
done

echo "DIAG_DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/diag_dstat.sh", "w") as f:
        f.write(SCRIPT)
    sftp.chmod("/tmp/diag_dstat.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/diag_dstat.sh", timeout=180000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
