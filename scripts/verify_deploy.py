import paramiko
from _ssh_config import ssh_connect_kwargs
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)

checks = [
    ("Web (nginx)", "curl -sI http://95.217.14.198/ | head -5"),
    ("API health", "curl -s http://95.217.14.198/api/v1/health"),
    ("API docs", "curl -s -o /dev/null -w '%{http_code}' http://95.217.14.198/api/docs"),
    ("Containers", "cd /opt/fashionerp && docker compose ps --format 'table {{.Name}}\t{{.Status}}'"),
    ("Disk", "df -h / | tail -1"),
    ("Memory", "free -h | grep Mem"),
]

for label, cmd in checks:
    print(f"\n=== {label} ===")
    _, stdout, _ = c.exec_command(cmd, timeout=30)
    print(stdout.read().decode("utf-8", errors="replace"))

c.close()
