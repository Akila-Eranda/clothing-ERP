#!/usr/bin/env python3
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
_, stdout, stderr = c.exec_command(
    "tail -50 /var/log/fashionerp-ssl-pending.log 2>/dev/null || echo '(no log file)'",
    timeout=30,
)
print(stdout.read().decode("utf-8", errors="replace"))
c.close()
