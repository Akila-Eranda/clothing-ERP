#!/bin/bash
# FashionERP anti-hijack: foreign redirects + HTML body malware injection.
# Detects blank-page attacks (ipstresser / rebirthstress SEO spam injected into HTML).
set -uo pipefail
LOG=/var/log/fashionerp-anti-hijack.log
COMPOSE_DIR=/opt/fashionerp
LOCK=/var/run/fashionerp-anti-hijack.lock
HOSTS="shop.hexalyte.com grocery.shop.hexalyte.com admin3.hexalyte.com"
IOC_HTML='ipstresser|rebirthstress|return\.st|DiamWall|booter|stresser\.rs|ref=NEXT|ref=Q7hw'

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

# 2) HTML body injection (ipstresser etc.) — blank/black page attack
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
