#!/usr/bin/env python3
import sys
from _ssh_config import ssh_connect_kwargs
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)

script = """#!/bin/bash
cd /opt/fashionerp
grep -E '^(REDIS_PASSWORD|NODE_ENV|JWT_)=' .env 2>/dev/null | sed 's/=.*/=***redacted***/' || true
grep REDIS docker-compose.yml | head -5
"""

stdin, stdout, stderr = c.exec_command("bash -s", timeout=60)
stdin.write(script)
stdin.channel.shutdown_write()
print(stdout.read().decode("utf-8", "replace"))
c.close()
