#!/usr/bin/env python3
import os, sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pwd = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
TEST = """docker run --rm --entrypoint node fashionerp-api:latest -e "const c=require('@prisma/client'); console.log('SubscriptionPlan', c.SubscriptionPlan); console.log('UserRole', c.UserRole); const d=require('.prisma/client/default'); console.log('UR', d.UserRole);" """
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=pwd, timeout=30)
_, o, e = c.exec_command(TEST, timeout=120000)
print(o.read().decode())
print(e.read().decode())
c.close()
