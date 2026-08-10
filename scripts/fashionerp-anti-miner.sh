#!/bin/bash
# FashionERP web anti-miner + reinfection watchdog.
# Runs every minute via /etc/cron.d/fashionerp-anti-miner
set +e

LOG=/var/log/fashionerp-anti-miner.log
COMPOSE_DIR=/opt/fashionerp
LOCK=/var/run/fashionerp-anti-miner.lock
C2_IPS="221.156.167.200 185.220.101.0/24"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }

# Host-side kill + C2 egress block (idempotent)
for ip in $C2_IPS; do
  iptables -C OUTPUT -d "$ip" -j DROP 2>/dev/null || iptables -I OUTPUT -d "$ip" -j DROP 2>/dev/null || true
done
# Block common miner stratum ports from host (outbound)
iptables -C OUTPUT -p tcp --dport 3333 -j DROP 2>/dev/null || iptables -I OUTPUT -p tcp --dport 3333 -j DROP 2>/dev/null || true
iptables -C OUTPUT -p tcp --dport 4444 -j DROP 2>/dev/null || iptables -I OUTPUT -p tcp --dport 4444 -j DROP 2>/dev/null || true
iptables -C OUTPUT -p tcp --dport 5555 -j DROP 2>/dev/null || iptables -I OUTPUT -p tcp --dport 5555 -j DROP 2>/dev/null || true
iptables -C OUTPUT -p tcp --dport 14444 -j DROP 2>/dev/null || iptables -I OUTPUT -p tcp --dport 14444 -j DROP 2>/dev/null || true
iptables -C OUTPUT -p tcp --dport 45700 -j DROP 2>/dev/null || iptables -I OUTPUT -p tcp --dport 45700 -j DROP 2>/dev/null || true

pkill -9 -f 'javae|xmrig|kdevtmpfsi|kinsing|\.ICEi-unix|Hkx5RL' 2>/dev/null || true
rm -rf /tmp/.ICEi-unix /var/tmp/.unix /tmp/.unix /dev/shm/.unix 2>/dev/null || true

CID=$(docker ps -qf name=^fashionerp_web$ || docker ps -qf name=fashionerp_web)
[ -n "$CID" ] || exit 0

INFECTED=0

# Inside container: kill miners + look for IOCs
docker exec -u root "$CID" sh -c '
  pkill -9 -f "javae|xmrig|kdevtmpfsi|kinsing|Hkx5RL|grep.tar.gz" 2>/dev/null || true
  rm -rf /tmp/.ICEi-unix /tmp/.unix /var/tmp/.unix /tmp/xmrig* /var/tmp/xmrig* /tmp/grep.tar.gz 2>/dev/null || true
' 2>/dev/null || true

# Detect from recent logs
if docker logs --since 3m "$CID" 2>&1 | grep -qiE 'xmrig|grep\.tar\.gz|/var/tmp/\.unix|kdevtmpfsi|kinsing|javae|\.ICEi-unix'; then
  INFECTED=1
fi

# Detect running weird processes (anything that is not next-server/node/sh/ps)
WEIRD=$(docker exec "$CID" sh -c 'ps aux 2>/dev/null | grep -viE "PID|next-server|node |ps aux|sh -c|busybox" | grep -v grep | wc -l' 2>/dev/null || echo 0)
if [ "${WEIRD:-0}" -gt 2 ] 2>/dev/null; then
  # soft signal — only escalate if miner strings also present in ps
  if docker exec "$CID" sh -c 'ps aux 2>/dev/null' 2>/dev/null | grep -qiE 'xmrig|javae|miner|kinsing'; then
    INFECTED=1
  fi
fi

if [ "$INFECTED" -eq 1 ]; then
  if [ -f "$LOCK" ]; then
    # avoid overlapping rebuilds (max once / 10 min)
    AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
    if [ "$AGE" -lt 600 ]; then
      log "infected but rebuild cooldown active (${AGE}s)"
      exit 0
    fi
  fi
  date +%s > "$LOCK"
  log "INFECTION DETECTED — recreating fashionerp_web"
  cd "$COMPOSE_DIR" || exit 1
  docker compose stop web >/dev/null 2>&1
  docker compose rm -f web >/dev/null 2>&1
  docker compose up -d --force-recreate --no-deps web >>"$LOG" 2>&1
  log "web recreated"
fi

exit 0
