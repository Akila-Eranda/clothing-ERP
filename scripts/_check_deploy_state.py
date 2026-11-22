#!/usr/bin/env python3
import os, sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pwd = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=pwd, timeout=30)
cmd = """
cd /opt/fashionerp
git log -1 --oneline
test -f apps/web/src/app/pos-retail-theme.css && echo HAS_RETAIL_CSS || echo NO_RETAIL_CSS
docker compose images web api 2>/dev/null || true
"""
_, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode())
err = e.read().decode()
if err.strip():
    print("ERR:", err)
c.close()
