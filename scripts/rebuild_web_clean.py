#!/usr/bin/env python3
"""Rebuild web container from clean source and restore shop routing."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
ROOT = r"e:\clothing shop"
REMOTE = "/opt/fashionerp"

# Critical web files that define routing behavior
FILES = [
    "apps/web/src/middleware.ts",
    "apps/web/src/app/layout.tsx",
    "apps/web/src/lib/fonts.ts",
    "apps/web/src/app/globals.css",
    "apps/web/tailwind.config.ts",
    "apps/web/next.config.ts",
    "apps/web/package.json",
    "apps/web/Dockerfile",
    "nginx/nginx.clothing.conf",
]

FIX = f"""#!/bin/bash
set -e
cd {REMOTE}

echo "==> Check next.config for redirects..."
grep -nE 'redirect|return\\.st|rewrite' apps/web/next.config.ts apps/web/src/middleware.ts || true

echo "==> Force rebuild web image (no cache)..."
docker compose build --no-cache web

echo "==> Recreate web container..."
docker compose up -d --force-recreate web
sleep 12

echo "==> Verify NO return.st redirect..."
for path in / /login /dashboard; do
  echo "--- :3000$path ---"
  curl -sI --connect-timeout 8 -H 'Host: shop.hexalyte.com' "http://127.0.0.1:3000$path" | head -12
done

echo ""
echo "--- public https ---"
curl -sI --connect-timeout 10 https://shop.hexalyte.com/login | head -15
curl -sI --connect-timeout 10 https://sl-deen-supermarket.shop.hexalyte.com/login | head -15

echo "WEB REBUILD DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.exists(local):
            print(f"  SKIP missing {rel}")
            continue
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        remote_dir = os.path.dirname(remote)
        parts = remote_dir.split("/")
        path = ""
        for p in parts:
            if not p:
                continue
            path += f"/{p}"
            try:
                sftp.stat(path)
            except FileNotFoundError:
                try:
                    sftp.mkdir(path)
                except OSError:
                    pass
        print(f"  upload {rel}")
        sftp.put(local, remote)

    with sftp.file("/tmp/rebuild_web_clean.sh", "w") as f:
        f.write(FIX)
    sftp.chmod("/tmp/rebuild_web_clean.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/rebuild_web_clean.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-8000:])
c.close()
