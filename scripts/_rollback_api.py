#!/usr/bin/env python3
import os, sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pwd = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("DEPLOY_PASSWORD")
FIX = r"""#!/bin/bash
set -e
cd /opt/fashionerp
echo "==> Available api images:"
docker images fashionerp-api --format '{{.ID}} {{.CreatedSince}} {{.Size}}' | head -10
OLD_ID=2c1251830955
if docker image inspect $OLD_ID >/dev/null 2>&1; then
  docker tag $OLD_ID fashionerp-api:latest
  echo "Tagged old image as latest"
else
  echo "Old image not found, listing all:"
  docker images | grep fashionerp-api
  exit 1
fi
docker compose up -d --force-recreate api
sleep 20
for i in 1 2 3 4 5; do
  H=$(curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 80)
  echo "health try $i: $H"
  echo "$H" | grep -q ok && break
  sleep 5
done
docker ps --filter name=fashionerp_api --format '{{.Names}} {{.Status}}'
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=pwd, timeout=30)
_, o, e = c.exec_command(FIX, timeout=120000)
print(o.read().decode())
print(e.read().decode()[-2000:])
c.close()
