#!/usr/bin/env python3
"""Issue/expand SSL certificate to include a given tenant subdomain."""

import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
DEPLOY_DIR = "/opt/fashionerp"

SUBDOMAIN = "sl-deen-supermarket"
FQDN = f"{SUBDOMAIN}.shop.hexalyte.com"

SCRIPT = f"""#!/bin/bash
set -e
cd {DEPLOY_DIR}

echo "==> Ensure pending marker exists..."
mkdir -p storage/.ssl-pending
date -Iseconds > "storage/.ssl-pending/{SUBDOMAIN}.pending"

echo "==> Expand/renew SSL (includes all tenants)..."
chmod +x scripts/renew_tenant_ssl.sh
bash scripts/renew_tenant_ssl.sh

echo "==> Verify SNI certificate contains {FQDN}..."
echo | openssl s_client -connect "{FQDN}:443" -servername "{FQDN}" 2>/dev/null \\
  | openssl x509 -noout -ext subjectAltName | grep -F "{FQDN}" && echo "OK: SAN contains {FQDN}"
"""


def main() -> int:
  c = paramiko.SSHClient()
  c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
  print(f"Connecting to {HOST}...")
  c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
  with c.open_sftp() as sftp:
    with sftp.file("/tmp/issue_tenant_ssl.sh", "w") as f:
      f.write(SCRIPT)
    sftp.chmod("/tmp/issue_tenant_ssl.sh", 0o755)
  _, stdout, stderr = c.exec_command("bash /tmp/issue_tenant_ssl.sh", timeout=600000)
  out = stdout.read().decode("utf-8", errors="replace")
  err = stderr.read().decode("utf-8", errors="replace")
  print(out)
  if err.strip():
    print("STDERR:", err[-8000:])
  c.close()
  return 0


if __name__ == "__main__":
  raise SystemExit(main())

