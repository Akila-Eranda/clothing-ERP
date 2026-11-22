#!/usr/bin/env python3
"""Check SSL automation (cron, pending files, env) on production."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

CHECK = r"""#!/bin/bash
cd /opt/fashionerp
echo "==> SSL pending files:"
PENDING=/var/lib/docker/volumes/fashionerp_uploads_data/_data/.ssl-pending
ls -la "$PENDING" 2>/dev/null || echo "(dir missing)"
echo
echo "==> Cron for SSL:"
grep -r ssl /etc/cron* 2>/dev/null || echo "(no cron found)"
crontab -l 2>/dev/null | grep -i ssl || true
echo
echo "==> API SSL env:"
docker compose exec -T api printenv | grep -E 'CLOUDFLARE|SERVER_IP|SSL_PENDING|TENANT_SSL' || true
echo
echo "==> cloudflare.ini:"
ls -la nginx/ssl/cloudflare.ini 2>/dev/null || echo "(missing — using HTTP per-tenant SAN expansion)"
echo
echo "==> Recent API SSL logs:"
docker compose logs api --tail=200 2>/dev/null | grep -i '\[SSL\]' || echo "(no ssl logs)"
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
sftp = c.open_sftp()
with sftp.file("/tmp/check_ssl_auto.sh", "w") as f:
    f.write(CHECK)
sftp.chmod("/tmp/check_ssl_auto.sh", 0o755)
sftp.close()
_, stdout, stderr = c.exec_command("bash /tmp/check_ssl_auto.sh", timeout=60)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err)
c.close()
