#!/usr/bin/env python3
import sys, paramiko
from _ssh_config import ssh_connect_kwargs
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=25)
cmd = r"""
echo '=== CRON ==='
ls -la /etc/cron.d/ | head -30
echo '---'
cat /etc/cron.d/fashionerp-anti-miner 2>/dev/null || true
grep -n fashionerp /etc/crontab 2>/dev/null || true
echo '=== WATCHDOG SCRIPT ==='
head -80 /usr/local/bin/fashionerp-anti-hijack.sh 2>/dev/null || echo NO_HIJACK
echo '=== ANTI MINER ==='
head -60 /usr/local/bin/fashionerp-anti-miner.sh 2>/dev/null || echo NO_MINER
echo '=== WEB HARDEN ==='
docker inspect fashionerp_web --format 'ro={{.HostConfig.ReadonlyRootfs}} security={{json .HostConfig.SecurityOpt}} capdrop={{json .HostConfig.CapDrop}}'
grep -A40 '^  web:' /opt/fashionerp/docker-compose.yml | head -45
echo '=== LOG TAIL ==='
tail -20 /var/log/fashionerp-anti-hijack.log 2>/dev/null || true
"""
stdin, stdout, stderr = c.exec_command(cmd, timeout=45, get_pty=True)
stdout.channel.settimeout(45)
print(stdout.read().decode("utf-8", "replace"))
c.close()
