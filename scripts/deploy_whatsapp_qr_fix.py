#!/usr/bin/env python3
"""Deploy WhatsApp QR fix (API + settings UI) and clear broken sessions."""
import sys
import paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(r"E:\clothing shop")

FILES = [
    "apps/api/src/modules/whatsapp/whatsapp.service.ts",
    "apps/web/src/components/settings/whatsapp-settings-tab.tsx",
]

DEPLOY = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}
echo "==> Clear broken WhatsApp auth sessions"
docker compose exec -T -u root api sh -c 'rm -rf /app/uploads/whatsapp-sessions/* || true; mkdir -p /app/uploads/whatsapp-sessions && chown -R nestjs:nodejs /app/uploads/whatsapp-sessions'
echo "==> Build api + web"
docker compose build api web
docker compose up -d api web
sleep 10
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 180
echo ""
echo "WHATSAPP QR FIX DEPLOYED"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = ROOT / rel
        remote = f"{DEPLOY_DIR}/{rel}"
        print(f"Upload {rel}")
        with open(local, "rb") as lf:
            with sftp.file(remote, "wb") as rf:
                rf.write(lf.read())
    with sftp.file("/tmp/deploy_wa_qr_fix.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/deploy_wa_qr_fix.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/deploy_wa_qr_fix.sh", timeout=900000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-6000:])
c.close()
