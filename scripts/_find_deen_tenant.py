#!/usr/bin/env python3
import sys
from _ssh_config import ssh_connect_kwargs
import paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)
cmd = """docker exec fashionerp_db psql -U fashionerp -d fashionerp -c "SELECT id, name, subdomain, status FROM tenants WHERE subdomain='sl-deen-supermarket';" """
_, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print(err[-800:])
c.close()
