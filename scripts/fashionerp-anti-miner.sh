#!/bin/bash
# FashionERP anti-miner + reinfection watchdog (web + api + host).
set +e

LOG=/var/log/fashionerp-anti-miner.log
COMPOSE_DIR=/opt/fashionerp
LOCK=/var/run/fashionerp-anti-miner.lock
C2_IPS="221.156.167.200"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG"; }

for ip in $C2_IPS; do
  iptables -C OUTPUT -d "$ip" -j DROP 2>/dev/null || iptables -I OUTPUT -d "$ip" -j DROP 2>/dev/null || true
  if iptables -L DOCKER-USER -n >/dev/null 2>&1; then
    iptables -C DOCKER-USER -d "$ip" -j DROP 2>/dev/null || iptables -I DOCKER-USER -d "$ip" -j DROP 2>/dev/null || true
    iptables -C DOCKER-USER -p tcp -d "$ip" --dport 9090 -j DROP 2>/dev/null || iptables -I DOCKER-USER -p tcp -d "$ip" --dport 9090 -j DROP 2>/dev/null || true
  fi
done
for p in 3333 4444 5555 7777 9090 14444 45700 13531; do
  iptables -C OUTPUT -p tcp --dport "$p" -j DROP 2>/dev/null || iptables -I OUTPUT -p tcp --dport "$p" -j DROP 2>/dev/null || true
  if iptables -L DOCKER-USER -n >/dev/null 2>&1; then
    iptables -C DOCKER-USER -p tcp --dport "$p" -j DROP 2>/dev/null || iptables -I DOCKER-USER -p tcp --dport "$p" -j DROP 2>/dev/null || true
  fi
done

pkill -9 -f 'javae|xmrig|kdevtmpfsi|kinsing|\.ICEi-unix|Hkx5RL|grep1\.sh|entrypoint\.sh' 2>/dev/null || true
rm -rf /tmp/.ICEi-unix /var/tmp/.unix /tmp/.unix /dev/shm/.unix 2>/dev/null || true

IOC_RE='xmrig|javae|kdevtmpfsi|kinsing|\.ICEi-unix|grep\.tar\.gz|Hkx5RL|221\.156\.167\.200|busybox wget|base64 -d \|sh|npm start|\.pm2/javae'

recreate_web() {
  if [ -f "$LOCK" ]; then
    AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
    if [ "$AGE" -lt 600 ]; then
      log "infected but rebuild cooldown (${AGE}s)"
      return 0
    fi
  fi
  date +%s > "$LOCK"
  log "INFECTION — force-recreate fashionerp_web"
  cd "$COMPOSE_DIR" || return 1
  docker compose stop web >/dev/null 2>&1
  docker compose rm -f web >/dev/null 2>&1
  docker compose up -d --force-recreate --no-deps web >>"$LOG" 2>&1
  log "web recreated"
}

# Scan fashionerp_web
CID=$(docker ps -qf name=fashionerp_web)
if [ -n "$CID" ]; then
  docker exec -u root "$CID" sh -c '
    pkill -9 -f "javae|xmrig|kdevtmpfsi|kinsing|Hkx5RL|grep1|busybox wget|221.156" 2>/dev/null || true
    rm -rf /tmp/.ICEi-unix /tmp/.unix /tmp/.pm2 /app/.pm2 /app/.next/.pm2 2>/dev/null || true
    rm -f /tmp/entrypoint.sh /app/entrypoint.sh "/app/npm start" 2>/dev/null || true
  ' 2>/dev/null || true

  # Detect infection via /proc (Debian slim may lack `ps`)
  if docker exec "$CID" sh -c 'for f in /proc/[0-9]*/cmdline; do tr "\0" " " < "$f" 2>/dev/null; echo; done' 2>/dev/null | grep -qiE "$IOC_RE"; then
    recreate_web
  elif docker logs --since 3m "$CID" 2>&1 | grep -qiE "$IOC_RE"; then
    recreate_web
  fi
fi

# Kill IOCs in other app containers (no auto-rebuild of foreign compose stacks)
for name in hexalyte-invoice-app hexaone-sales-api hexaone-sales-web fashionerp_api; do
  OCID=$(docker ps -qf name="^${name}$" || docker ps -qf name="$name")
  [ -n "$OCID" ] || continue
  if docker exec "$OCID" sh -c 'ps aux' 2>/dev/null | grep -qiE 'xmrig|javae|221\.156\.167\.200|busybox wget.*9090'; then
    log "IOC process in $name — killing"
    docker exec -u root "$OCID" sh -c 'pkill -9 -f "xmrig|javae|221.156|busybox wget" 2>/dev/null || true' 2>/dev/null || true
  fi
done

exit 0
