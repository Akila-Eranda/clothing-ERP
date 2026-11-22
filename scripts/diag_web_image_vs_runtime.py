#!/usr/bin/env python3
"""Diagnostic ONLY: is the d-stat redirect baked into the image or a runtime infection?"""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

SCRIPT = r"""#!/bin/bash
set +e
cd /opt/fashionerp

echo "=== 1) HOST-SIDE process list of running web container (no exec) ==="
docker top fashionerp_web 2>&1 | head -60

echo ""
echo "=== 2) web container resource/pids ==="
docker stats --no-stream --format 'table {{.Name}}\t{{.PIDs}}\t{{.MemUsage}}\t{{.CPUPerc}}' fashionerp_web hexalyte-invoice-app 2>&1 | head

echo ""
echo "=== 3) Run a FRESH throwaway container from fashionerp-web:latest and probe it ==="
docker run -d --rm --name web_probe --network fashionerp_default fashionerp-web:latest >/dev/null 2>&1
sleep 6
PROBEIP=$(docker inspect web_probe --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null)
echo "probe IP: $PROBEIP"
for ip in $PROBEIP; do
  echo "--- FRESH image http://$ip:3000/login (Host shop.hexalyte.com) ---"
  docker exec fashionerp_nginx sh -c "wget -S -qO /dev/null --header='Host: shop.hexalyte.com' 'http://$ip:3000/login' 2>&1 | sed 's/^/   /' | head -12"
done
docker stop web_probe >/dev/null 2>&1

echo ""
echo "=== 4) Inspect the IMAGE middleware.js for external redirect strings ==="
docker run --rm --entrypoint sh fashionerp-web:latest -c '
  grep -aoE "https?://[a-zA-Z0-9.-]+" /app/.next/server/src/middleware.js 2>/dev/null | sort -u | head -40
  echo "--- d-stat / stat matches in image middleware ---"
  grep -aoE "d-stat|dstat|[a-z0-9-]*\.net|stresser|booter" /app/.next/server/src/middleware.js 2>/dev/null | sort -u | head
' 2>&1 | head -60

echo ""
echo "=== 5) Compare md5 of middleware/server: IMAGE vs RUNNING container ==="
echo "-- image --"
docker run --rm --entrypoint sh fashionerp-web:latest -c 'md5sum /app/server.js /app/.next/server/src/middleware.js 2>/dev/null'
echo "-- running (may fail if forks exhausted) --"
timeout 15 docker exec fashionerp_web sh -c 'md5sum /app/server.js /app/.next/server/src/middleware.js 2>/dev/null' 2>&1 | head

echo ""
echo "=== 6) Full docker inspect of web: entrypoint/cmd + mounts + created ==="
docker inspect fashionerp_web --format 'Image={{.Image}}
Created={{.Created}}
Cmd={{.Config.Cmd}}
Entrypoint={{.Config.Entrypoint}}
Binds={{.HostConfig.Binds}}
Mounts={{range .Mounts}}{{.Type}}:{{.Source}}->{{.Destination}} {{end}}' 2>&1

echo ""
echo "=== 7) When was the image built vs container started ==="
docker inspect fashionerp-web:latest --format 'image_created={{.Created}}' 2>&1
docker inspect fashionerp_web --format 'container_started={{.State.StartedAt}}' 2>&1

echo "DIAG2_DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/diag_web2.sh", "w") as f:
        f.write(SCRIPT)
    sftp.chmod("/tmp/diag_web2.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/diag_web2.sh", timeout=180000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
