#!/usr/bin/env python3
"""Install HTML-injection + redirect anti-hijack watchdog on the server."""
import sys
import time
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
WATCHDOG = r'''#!/bin/bash
# FashionERP anti-hijack: foreign redirects + HTML body malware injection.
set -uo pipefail
LOG=/var/log/fashionerp-anti-hijack.log
COMPOSE_DIR=/opt/fashionerp
LOCK=/var/run/fashionerp-anti-hijack.lock
HOSTS="shop.hexalyte.com grocery.shop.hexalyte.com admin3.hexalyte.com"
IOC_HTML='ipstresser|rebirthstress|return\.st|DiamWall|booter|stresser\.rs|ref=NEXT|ref=Q7hw|RCE_RES'

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }

recreate_web() {
  reason="$1"
  if [ -f "$LOCK" ]; then
    AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
    if [ "$AGE" -lt 300 ]; then
      log "hijack ($reason) but cooldown ${AGE}s"
      return 0
    fi
  fi
  date +%s > "$LOCK"
  log "HIJACK DETECTED ($reason) — recreating web"
  cd "$COMPOSE_DIR" || return 1
  docker compose up -d --force-recreate --no-deps web >>"$LOG" 2>&1
  log "web recreated"
}

# 1) Redirect hijack (Location to non-hexalyte host)
for h in $HOSTS; do
  HDRS=$(curl -skI --connect-timeout 6 --max-time 12 "https://127.0.0.1/login" -H "Host: $h" 2>/dev/null | tr -d '\r')
  CODE=$(echo "$HDRS" | awk 'NR==1{print $2}')
  LOC=$(echo "$HDRS" | awk -F': ' 'tolower($1)=="location"{print $2; exit}')
  if echo "$CODE" | grep -Eq '^30[0-9]$'; then
    if ! echo "${LOC:-}" | grep -Eqi '://([a-z0-9.-]+\.)?hexalyte\.com(/|$)|^/'; then
      recreate_web "redirect $h code=$CODE loc=$LOC"
      exit 0
    fi
  fi
done

# 2) HTML body injection (ipstresser etc.) — the blank-page attack
BODY=$(curl -sk --connect-timeout 8 --max-time 20 "https://127.0.0.1/login" -H "Host: grocery.shop.hexalyte.com" 2>/dev/null || true)
if [ -n "$BODY" ] && echo "$BODY" | grep -qiE "$IOC_HTML"; then
  recreate_web "html-injection grocery.login"
  exit 0
fi
ABODY=$(curl -sk --connect-timeout 8 --max-time 20 "https://127.0.0.1/admin" -H "Host: admin3.hexalyte.com" 2>/dev/null || true)
if [ -n "$ABODY" ] && echo "$ABODY" | grep -qiE "$IOC_HTML"; then
  recreate_web "html-injection admin3"
  exit 0
fi

# 3) Best-effort cleanup of known miner drop dirs inside web tmpfs
docker exec -u root fashionerp_web sh -c 'rm -rf /tmp/.ICEi-unix /tmp/.*unix* /tmp/*javae* /tmp/.pm2 2>/dev/null; pkill -9 -f "javae|xmrig|kdevtmpfsi|kinsing|ipstresser" 2>/dev/null' >/dev/null 2>&1 || true
exit 0
'''

ANTI_MINER_PATCH_NOTE = "also detects html injection IOCs via companion anti-hijack"

INSTALL = r'''#!/bin/bash
set -e
cd /opt/fashionerp

install -m 0755 /tmp/fashionerp-anti-hijack.sh /usr/local/bin/fashionerp-anti-hijack.sh

# cron every 2 minutes
if [ -d /etc/cron.d ]; then
  cat > /etc/cron.d/fashionerp-anti-hijack <<'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
*/2 * * * * root /usr/local/bin/fashionerp-anti-hijack.sh
CRON
  chmod 644 /etc/cron.d/fashionerp-anti-hijack
fi

# Also keep /etc/crontab entry if present, avoid duplicates
grep -F '/usr/local/bin/fashionerp-anti-hijack.sh' /etc/crontab >/dev/null 2>&1 || \
  echo '*/2 * * * * root /usr/local/bin/fashionerp-anti-hijack.sh' >> /etc/crontab

# Ensure web harden flags present in running compose
if ! grep -A25 '^  web:' docker-compose.yml | grep -q 'read_only: true'; then
  echo "WARN: docker-compose web missing read_only — check manually"
fi

# Run once now
/usr/local/bin/fashionerp-anti-hijack.sh || true

echo '=== VERIFY ==='
ls -la /usr/local/bin/fashionerp-anti-hijack.sh /etc/cron.d/fashionerp-anti-hijack
docker inspect fashionerp_web --format 'ro={{.HostConfig.ReadonlyRootfs}} caps={{json .HostConfig.CapDrop}} security={{json .HostConfig.SecurityOpt}}'
curl -sk https://grocery.shop.hexalyte.com/login | grep -ciE 'ipstresser|rebirthstress|return\.st' || echo html_ioc=0
curl -sk -o /dev/null -w 'login=%{http_code}\n' https://grocery.shop.hexalyte.com/login
echo HARDEN_OK
'''


def connect():
    last = None
    for i in range(5):
        try:
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(HOST, username=USER, password=PASSWORD, timeout=30, banner_timeout=30, auth_timeout=30)
            return c
        except Exception as e:
            last = e
            print(f"connect retry {i+1}: {e}")
            time.sleep(3)
    raise last


def main():
    c = connect()
    print("connected")
    with c.open_sftp() as sftp:
        with sftp.file("/tmp/fashionerp-anti-hijack.sh", "w") as f:
            f.write(WATCHDOG)
        sftp.chmod("/tmp/fashionerp-anti-hijack.sh", 0o755)
        with sftp.file("/tmp/install_anti_hijack.sh", "w") as f:
            f.write(INSTALL)
        sftp.chmod("/tmp/install_anti_hijack.sh", 0o755)

    stdin, stdout, stderr = c.exec_command("bash /tmp/install_anti_hijack.sh", timeout=120, get_pty=True)
    stdout.channel.settimeout(120)
    out = stdout.read().decode("utf-8", "replace")
    print(out)
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        print("STDERR:", err[-2000:])
    c.close()
    if "HARDEN_OK" not in out:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
