#!/usr/bin/env python3
"""Full incident response: kill malware, close exposed ports, harden web, rebuild."""
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
    "docker-compose.yml",
    "apps/web/src/middleware.ts",
    "apps/web/Dockerfile",
    "nginx/nginx.clothing.conf",
]

SCRIPT = f"""#!/bin/bash
set -e
cd {REMOTE}
INC=/root/incident-$(date +%Y%m%d%H%M)
mkdir -p "$INC"

echo "======== INCIDENT RESPONSE $(date -u) ========"

echo "==> A) Snapshot malware from web if present"
docker top fashionerp_web 2>/dev/null | tee "$INC/docker-top-before.txt" || true
docker compose exec -u root -T web sh -c 'ps aux; ls -laR /tmp 2>/dev/null; find /tmp -type f' > "$INC/web-tmp.txt" 2>&1 || true
docker compose cp web:/tmp/.ICEi-unix "$INC/" 2>/dev/null || true

echo "==> B) Block scanning / attacker IP ranges on SSH"
iptables -C INPUT -s 120.55.0.0/16 -j DROP 2>/dev/null || iptables -I INPUT -s 120.55.0.0/16 -j DROP
# rate-limit new SSH connections (best-effort)
iptables -C INPUT -p tcp --dport 22 -m state --state NEW -m recent --set 2>/dev/null || \
  iptables -I INPUT -p tcp --dport 22 -m state --state NEW -m recent --set
iptables -C INPUT -p tcp --dport 22 -m state --state NEW -m recent --update --seconds 60 --hitcount 8 -j DROP 2>/dev/null || \
  iptables -I INPUT -p tcp --dport 22 -m state --state NEW -m recent --update --seconds 60 --hitcount 8 -j DROP
# kill lingering sessions from 120.55
for pid in $(ss -antp | grep 120.55 | grep -oP 'pid=\\K[0-9]+' | sort -u); do kill -9 $pid 2>/dev/null || true; done

echo "==> C) Tear down infected web"
docker compose stop web || true
docker compose rm -f web || true
docker rmi fashionerp-web:latest || true

echo "==> D) Close previously published ports (iptables safety until recreate)"
iptables -C INPUT -p tcp --dport 3000 -j DROP 2>/dev/null || iptables -I INPUT -p tcp --dport 3000 -j DROP
iptables -C INPUT -p tcp --dport 3001 -j DROP 2>/dev/null || iptables -I INPUT -p tcp --dport 3001 -j DROP
iptables -C INPUT -p tcp --dport 5433 -j DROP 2>/dev/null || iptables -I INPUT -p tcp --dport 5433 -j DROP
iptables -C INPUT -p tcp --dport 6379 -j DROP 2>/dev/null || iptables -I INPUT -p tcp --dport 6379 -j DROP

echo "==> E) Rebuild hardened web (no public 3000, read_only)"
docker compose build --no-cache --pull web
docker compose up -d api web nginx
# recreate postgres/redis to apply localhost bind (brief blip ok)
docker compose up -d postgres redis
sleep 20

echo "==> F) Verify processes clean + ports not public"
docker top fashionerp_web | tee "$INC/docker-top-after.txt"
ss -lntp | tee "$INC/listen-after.txt"
echo "Public 3000/3001 check from outside binding:"
ss -lntp | grep -E ':3000|:3001|:5433|:6379' || echo "OK: internal services not on 0.0.0.0"

echo "==> G) HTTPS verify"
for u in https://shop.hexalyte.com/login https://sl-deen-supermarket.shop.hexalyte.com/login https://general.shop.hexalyte.com/login https://shop.clothing.api.hexalyte.com/api/v1/health; do
  echo "--- $u ---"
  curl -sI --connect-timeout 12 "$u" | head -10
done

echo "==> H) Anti-hijack watchdog"
cat > /usr/local/bin/fashionerp-anti-hijack.sh <<'WATCH'
#!/bin/bash
set -euo pipefail
LOG=/var/log/fashionerp-anti-hijack.log
# Detect redirect hijack
LOC=$(curl -skI --connect-timeout 5 https://127.0.0.1/login -H 'Host: shop.hexalyte.com' 2>/dev/null | tr -d '\\r' | awk -F': ' 'tolower($1)=="location"{{print $2; exit}}')
if echo "${{LOC:-}}" | grep -Eqi 'rebirthstress|return\\.st|stresser|booter|DiamWall'; then
  echo "$(date -u) HIJACK location=$LOC" >> "$LOG"
  cd /opt/fashionerp
  docker compose up -d --force-recreate web
  echo "$(date -u) recreated web" >> "$LOG"
fi
# Detect miner process inside web
if docker top fashionerp_web 2>/dev/null | grep -Eqi 'javae|ICEi|xmrig|kdevtmpfsi|kinsing'; then
  echo "$(date -u) MALWARE PROCESS in web — recreating" >> "$LOG"
  cd /opt/fashionerp
  docker compose up -d --force-recreate web
fi
WATCH
chmod +x /usr/local/bin/fashionerp-anti-hijack.sh
grep -F fashionerp-anti-hijack /etc/crontab >/dev/null 2>&1 || \
  echo '*/2 * * * * root /usr/local/bin/fashionerp-anti-hijack.sh' >> /etc/crontab

echo "INCIDENT_RESPONSE_DONE -> $INC"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        remote = f"{REMOTE}/{rel}"
        remote_dir = os.path.dirname(remote)
        parts = remote_dir.split("/")
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
        print("upload", rel)
        sftp.put(local, remote)
    with sftp.file("/tmp/incident_response.sh", "w") as f:
        f.write(SCRIPT)
    sftp.chmod("/tmp/incident_response.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/incident_response.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-8000:])
c.close()
