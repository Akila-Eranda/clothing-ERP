#!/usr/bin/env python3
"""Deploy Cake House (BAKERY) shop type + seed SweetNest demo tenant with products/images."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = r"e:\clothing shop"

FILES = [
    "apps/api/prisma/schema.prisma",
    "apps/api/prisma/seed.ts",
    "apps/api/src/shared/shop-profiles.ts",
    "apps/web/src/lib/shop-profiles.ts",
    "scripts/_seed_cakehouse.js",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

echo "==> Git pull..."
git fetch origin main
git reset --hard origin/main

echo "==> Build api+web (BAKERY enum + profiles)..."
docker compose build api web
docker compose up -d api web nginx

echo "==> Prisma db push (ShopType.BAKERY)..."
docker compose exec -u root -T api npx prisma db push --accept-data-loss
docker compose exec -u root -T api npx prisma generate

echo "==> Seed Cake House demo (products + images + customers + suppliers)..."
docker compose cp scripts/_seed_cakehouse.js api:/app/seed_cakehouse.js
docker compose exec -u root -T api node /app/seed_cakehouse.js

echo "==> Nginx reload..."
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload || true

sleep 6
echo "==> Health..."
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200
echo ""
curl -sI https://cake.shop.hexalyte.com/login | head -5
echo ""
echo "CAKE HOUSE DEMO DEPLOY COMPLETE"
echo "URL: https://cake.shop.hexalyte.com"
echo "Admin: admin@cake.demo.fashionerp.com / Admin@123456"
"""

def main():
    print("Connecting...")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    # Prefer git pull of committed files; also SFTP seed script as safety
    with c.open_sftp() as sftp:
        local = ROOT.replace("\\", "/") + "/scripts/_seed_cakehouse.js"
        remote = f"{DEPLOY_DIR}/scripts/_seed_cakehouse.js"
        print(f"SFTP {local} -> {remote}")
        try:
            sftp.put(local, remote)
        except Exception as e:
            print("SFTP note:", e)

        with sftp.file("/tmp/deploy_cakehouse.sh", "w") as f:
            f.write(DEPLOY)
        sftp.chmod("/tmp/deploy_cakehouse.sh", 0o755)

    print("Running deploy...")
    _, stdout, stderr = c.exec_command("bash /tmp/deploy_cakehouse.sh", timeout=1200)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    print(out[-8000:] if len(out) > 8000 else out)
    if err.strip():
        print("STDERR:", err[-4000:])
    c.close()

if __name__ == "__main__":
    main()
