#!/usr/bin/env python3
"""Diagnose tenant subdomain SSL on production."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"

CHECK = r"""#!/bin/bash
cd /opt/fashionerp
echo "==> Tenants in DB:"
docker compose exec -T postgres psql -U fashionerp -d fashionerp -tAc \
  "SELECT subdomain FROM tenants WHERE subdomain NOT IN ('platform') ORDER BY subdomain"

echo ""
echo "==> Certbot SAN list:"
certbot certificates 2>/dev/null | grep -A1 "Domains:"

echo ""
echo "==> Per-subdomain SSL check:"
SUBDOMAINS=$(docker compose exec -T postgres psql -U fashionerp -d fashionerp -tAc \
  "SELECT subdomain FROM tenants WHERE subdomain NOT IN ('platform') ORDER BY subdomain" | tr -d ' ' | grep -v '^$')
for s in $SUBDOMAINS; do
  host="${s}.shop.hexalyte.com"
  san=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null \
    | openssl x509 -noout -ext subjectAltName 2>/dev/null | tr -d ' ' || echo "CONNECT_FAIL")
  if echo "$san" | grep -q "DNS:${host}"; then
    echo "  OK  $host"
  else
    echo "  BAD $host -> $san"
  fi
done
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
sftp = c.open_sftp()
with sftp.file("/tmp/diag_tenant_ssl.sh", "w") as f:
    f.write(CHECK)
sftp.chmod("/tmp/diag_tenant_ssl.sh", 0o755)
sftp.close()
_, stdout, stderr = c.exec_command("bash /tmp/diag_tenant_ssl.sh", timeout=120)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err)
c.close()
