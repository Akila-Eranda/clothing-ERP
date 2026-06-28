#!/usr/bin/env python3
"""Deploy tyre workshop features to production via SFTP + rebuild."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
ROOT = r"e:\clothing shop"
REMOTE = "/opt/fashionerp"

FILES = [
    "apps/api/prisma/schema.prisma",
    "apps/api/prisma/seed.js",
    "apps/api/prisma/migrations/20260628160000_tyre_workshop/migration.sql",
    "apps/api/src/modules/workshop/workshop.module.ts",
    "apps/api/src/modules/products/products.service.ts",
    "apps/api/src/modules/reports/reports.module.ts",
    "apps/api/src/shared/shop-profiles.ts",
    "apps/api/src/app.module.ts",
    "apps/api/Dockerfile",
    "apps/web/src/lib/shop-profiles.ts",
    "apps/web/src/lib/shop-vertical.ts",
    "apps/web/src/lib/shop-features.ts",
    "apps/web/src/lib/print-tag-document.ts",
    "apps/web/src/components/layout/sidebar.tsx",
    "apps/web/src/components/customers/view-customer-modal.tsx",
    "apps/web/src/app/(dashboard)/job-cards/page.tsx",
    "apps/web/src/app/(dashboard)/appointments/page.tsx",
    "apps/web/src/app/(dashboard)/services/page.tsx",
    "apps/web/src/app/(dashboard)/warranty/page.tsx",
    "apps/web/src/app/(dashboard)/products/new/page.tsx",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {REMOTE}
docker compose build api web
docker compose up -d api web
sleep 12
docker compose exec -u root -T api npx prisma db push --accept-data-loss
docker compose cp apps/api/prisma/seed.js api:/app/prisma/seed.js
docker compose exec -u root -T api node prisma/seed.js
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 150
echo ""
echo "WORKSHOP DEPLOY DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        remote_dir = os.path.dirname(remote).replace(chr(92), "/")
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
        print(f"  {rel}")
        sftp.put(local, remote)

with c.open_sftp() as sftp:
    with sftp.file("/tmp/deploy_workshop.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_workshop.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/deploy_workshop.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-6000:])
c.close()
