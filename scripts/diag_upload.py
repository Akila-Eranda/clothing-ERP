#!/usr/bin/env python3
import paramiko

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

cmds = [
    "cd /opt/fashionerp && docker compose exec -u root -T api sh -c 'mkdir -p /app/uploads; chown -R nestjs:nodejs /app/uploads; ls -la /app/uploads'",
    "cd /opt/fashionerp && docker compose logs api --tail 20 2>&1",
]

for cmd in cmds:
    print("=" * 60)
    print(cmd)
    print("=" * 60)
    _, stdout, stderr = client.exec_command(cmd, timeout=60)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    print(out)
    if err.strip():
        print("STDERR:", err)

client.close()
