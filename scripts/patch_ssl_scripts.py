#!/usr/bin/env python3
"""Upload SSL scripts to production and clear stale pending marker."""
import sys
from pathlib import Path
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
DEPLOY_DIR = "/opt/fashionerp"
ROOT = Path(__file__).resolve().parent.parent

FILES = [
    ("scripts/renew_tenant_ssl.sh", f"{DEPLOY_DIR}/scripts/renew_tenant_ssl.sh"),
    ("scripts/process_ssl_pending.sh", f"{DEPLOY_DIR}/scripts/process_ssl_pending.sh"),
]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
sftp = c.open_sftp()
for local_rel, remote in FILES:
    local = ROOT / local_rel
    sftp.put(str(local), remote)
    sftp.chmod(remote, 0o755)
    print(f"Uploaded {local_rel}")
sftp.close()

_, stdout, _ = c.exec_command(
    f"rm -f /var/lib/docker/volumes/fashionerp_uploads_data/_data/.ssl-pending/aki.pending && "
    f"chmod +x {DEPLOY_DIR}/scripts/renew_tenant_ssl.sh {DEPLOY_DIR}/scripts/process_ssl_pending.sh",
    timeout=30,
)
stdout.channel.recv_exit_status()
print("Cleared aki.pending marker")
c.close()
