#!/bin/bash
# Apply egress hardening for FashionERP web/miner IOCs (host + Docker FORWARD).
# Idempotent — safe to re-run.
set -e

C2_HOSTS=(
  "221.156.167.200"
)

MINER_PORTS=(3333 4444 5555 7777 14444 45700 13531)

ensure_drop_out() {
  local spec="$1"
  # Host OUTPUT
  # shellcheck disable=SC2086
  iptables -C OUTPUT $spec -j DROP 2>/dev/null || iptables -I OUTPUT $spec -j DROP
  # Docker forwarded traffic (containers)
  if iptables -L DOCKER-USER -n >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    iptables -C DOCKER-USER $spec -j DROP 2>/dev/null || iptables -I DOCKER-USER $spec -j DROP
  fi
}

echo "==> Block known miner C2 hosts"
for ip in "${C2_HOSTS[@]}"; do
  ensure_drop_out "-d $ip"
  echo "DROP $ip"
done

echo "==> Block common miner stratum ports (outbound)"
for p in "${MINER_PORTS[@]}"; do
  ensure_drop_out "-p tcp --dport $p"
  echo "DROP tcp/$p"
done

if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save || true
elif command -v iptables-save >/dev/null 2>&1; then
  mkdir -p /etc/iptables
  iptables-save > /etc/iptables/rules.v4 || true
fi

echo "EGRESS_HARDENING_OK"
iptables -L OUTPUT -n | head -25
echo "---- DOCKER-USER ----"
iptables -L DOCKER-USER -n 2>/dev/null | head -25 || echo "(no DOCKER-USER chain)"
