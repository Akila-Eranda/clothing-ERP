#!/usr/bin/env python3
import os, sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pwd = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=pwd, timeout=30)
_, o, _ = c.exec_command("docker inspect fashionerp_web --format '{{.Image}}' && docker inspect fashionerp_api --format '{{.Image}}'", timeout=30)
print(o.read().decode())
c.close()
