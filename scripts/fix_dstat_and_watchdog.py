#!/usr/bin/env python3
"""Recreate clean web, install robust anti-hijack watchdog (any foreign redirect),
then monitor for re-infection timing."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

SCRIPT = r"""#!/bin/bash
set +e
cd /opt/fashionerp

echo "=== 1) Install ROBUST anti-hijack watchdog ==="
cat > /usr/local/bin/fashionerp-anti-hijack.sh <<'WATCH'
#!/bin/bash
set -uo pipefail
LOG=/var/log/fashionerp-anti-hijack.log
# Expected self host; any 30x Location to a DIFFERENT host = hijack
HDRS=$(curl -skI --connect-timeout 6 https://127.0.0.1/login -H 'Host: shop.hexalyte.com' 2>/dev/null | tr -d '\r')
CODE=$(echo "$HDRS" | awk 'NR==1{print $2}')
LOC=$(echo "$HDRS"  | awk -F': ' 'tolower($1)=="location"{print $2; exit}')
HIJACK=0
if echo "$CODE" | grep -Eq '^30[0-9]$'; then
  # a redirect happened; allow only redirects that stay on our own domain
  if ! echo "${LOC:-}" | grep -Eqi '://([a-z0-9.-]+\.)?hexalyte\.com|^/'; then
    HIJACK=1
  fi
fi
if [ "$HIJACK" = "1" ]; then
  echo "$(date -u) HIJACK code=$CODE location=$LOC — recreating web" >> "$LOG"
  cd /opt/fashionerp
  docker compose up -d --force-recreate web >>"$LOG" 2>&1
  echo "$(date -u) web recreated" >> "$LOG"
fi
# Best-effort miner cleanup inside web tmpfs
docker exec -u root fashionerp_web sh -c 'rm -rf /tmp/.ICEi-unix /tmp/.*unix* /tmp/*javae* 2>/dev/null; pkill -9 -f "javae|xmrig|kdevtmpfsi|kinsing" 2>/dev/null' 2>/dev/null || true
WATCH
chmod +x /usr/local/bin/fashionerp-anti-hijack.sh
echo "watchdog updated"

echo ""
echo "=== 2) Recreate clean web NOW ==="
docker compose up -d --force-recreate web 2>&1 | tail -6
sleep 10

echo ""
echo "=== 3) Verify immediately after recreate ==="
verify() {
  local tag="$1"
  local h
  h=$(curl -skI --connect-timeout 8 https://127.0.0.1/login -H 'Host: shop.hexalyte.com' 2>/dev/null | tr -d '\r')
  local code loc
  code=$(echo "$h" | awk 'NR==1{print $2}')
  loc=$(echo "$h" | awk -F': ' 'tolower($1)=="location"{print $2; exit}')
  echo "[$tag] code=$code location=${loc:-<none>}"
}
verify "t+10s"

echo ""
echo "=== 4) Monitor re-infection over ~4 min ==="
for t in 30 30 60 60 60; do
  sleep $t
  verify "after ${t}s"
done

echo ""
echo "=== 5) web PIDs after recreate ==="
docker stats --no-stream --format 'table {{.Name}}\t{{.PIDs}}\t{{.MemUsage}}\t{{.CPUPerc}}' fashionerp_web 2>&1 | head

echo ""
echo "=== 6) External check via public hostname ==="
curl -sI --connect-timeout 10 https://shop.hexalyte.com/login | head -6

echo "FIX_DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/fix_dstat.sh", "w") as f:
        f.write(SCRIPT)
    sftp.chmod("/tmp/fix_dstat.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/fix_dstat.sh", timeout=600000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
