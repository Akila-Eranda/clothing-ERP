#!/usr/bin/env python3
"""Continue slow-server diag + reclaim docker build cache."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
CMD = r"""
echo '===== BEFORE DISK ====='
df -h / | tail -1
docker system df

echo
echo '===== OVERLAY / IMAGES ====='
du -sh /var/lib/docker/overlay2 2>/dev/null || true
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.ID}}' | head -20

echo
echo '===== CPU CORES / LOAD ====='
nproc
uptime
cat /proc/loadavg
free -h
echo
echo '===== NO SWAP ====='
swapon --show || true

echo
echo '===== TOP BY CPU (5s sample) ====='
top -b -n 2 -d 1 | tail -25

echo
echo '===== PRUNE BUILD CACHE (safe) ====='
docker builder prune -af
docker image prune -f

echo
echo '===== AFTER DISK ====='
df -h / | tail -1
docker system df

echo
echo '===== REDIS BLOCK / CLIENTS ====='
docker exec fashionerp_redis redis-cli INFO clients | head -15
docker exec fashionerp_redis redis-cli INFO persistence | head -20
docker exec fashionerp_redis redis-cli DBSIZE

echo
echo '===== API INTERNAL TIMING ====='
docker exec fashionerp_api wget -qO- --timeout=5 http://127.0.0.1:4000/api/v1/health 2>/dev/null | head -c 200; echo
time curl -sk -o /dev/null -w "api_health=%{time_total}\n" https://shop.clothing.api.hexalyte.com/api/v1/health
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = c.exec_command(CMD, timeout=300)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-4000:])
c.close()
