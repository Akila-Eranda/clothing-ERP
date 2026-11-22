#!/usr/bin/env python3
"""Fix SSL: renew certs, copy to nginx, setup cron for auto-renewal."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
ROOT = r"e:\clothing shop"
REMOTE = "/opt/fashionerp"

FILES = [
    "scripts/renew_tenant_ssl.sh",
    "scripts/process_ssl_pending.sh",
]

FIX = f"""#!/bin/bash
set -e
cd {REMOTE}

chmod +x scripts/renew_tenant_ssl.sh scripts/process_ssl_pending.sh

echo "==> Renew SSL for all tenants..."
bash scripts/renew_tenant_ssl.sh

echo "==> Setup cron for pending SSL (every 3 min)..."
CRON_LINE='*/3 * * * * root {REMOTE}/scripts/process_ssl_pending.sh >> /var/log/fashionerp-ssl-pending.log 2>&1'
grep -F 'process_ssl_pending.sh' /etc/crontab 2>/dev/null || echo "$CRON_LINE" >> /etc/crontab

echo "==> Verify domains..."
for host in shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com general.shop.hexalyte.com tyres.shop.hexalyte.com; do
  subj=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null | openssl x509 -noout -subject 2>/dev/null || echo FAIL)
  code=$(curl -sk -o /dev/null -w '%{{http_code}}' --connect-timeout 10 "https://$host/" 2>/dev/null || echo ERR)
  echo "  $host -> $subj (HTTP $code)"
done

echo "SSL FIX DONE"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    for rel in FILES:
        local = os.path.join(ROOT, rel.replace("/", os.sep))
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        print(f"  upload {rel}")
        sftp.put(local, remote)
    with sftp.file("/tmp/fix_ssl.sh", "w") as f:
        f.write(FIX)
    sftp.chmod("/tmp/fix_ssl.sh", 0o755)

_, stdout, stderr = c.exec_command("bash /tmp/fix_ssl.sh", timeout=600000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-8000:])
c.close()
