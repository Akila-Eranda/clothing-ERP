#!/usr/bin/env python3
"""Locate exact return.st string in web container and source."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

SCRIPT = r"""#!/bin/bash
set +e
cd /opt/fashionerp

echo "=== exact return.st in apps/web source ==="
grep -RsnF 'return.st' apps/web --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.json' 2>/dev/null | head -50 || echo none-source

echo ""
echo "=== exact in container /app/src and middleware ==="
docker compose exec -T web sh -c 'grep -RsnF "return.st" /app/src /app/middleware.js /app/middleware.ts /app/.next/server/src 2>/dev/null | head -40' || true

echo ""
echo "=== strings from middleware server file ==="
docker compose exec -T web sh -c 'grep -oF "return.st" /app/.next/server/src/middleware.js 2>/dev/null; grep -o "https://return[^\" ]*" /app/.next/server/src/middleware.js 2>/dev/null | head'
docker compose exec -T web sh -c 'ls -la /app/.next/server/src/middleware.js /app/server.js /app/middleware.js 2>/dev/null'

echo ""
echo "=== inspect middleware.js for redirect URL near Location ==="
docker compose exec -T web sh -c 'python3 - <<"PY"
import re
p="/app/.next/server/src/middleware.js"
try:
  s=open(p,"r",errors="ignore").read()
except Exception as e:
  print("no file", e); raise SystemExit
for m in re.finditer(r"return\.st[^\s\"\']*", s):
  print("FOUND", m.group(0)[:120])
idx=s.find("return.st")
print("idx", idx)
if idx>=0:
  print(s[max(0,idx-200):idx+200])
# also search Q7hw
idx2=s.find("Q7hw")
print("ref idx", idx2)
if idx2>=0:
  print(s[max(0,idx2-200):idx2+200])
PY'

echo ""
echo "=== check node entrypoint / standalone server.js ==="
docker compose exec -T web sh -c 'ls -la /app; head -c 400 /app/server.js; echo; grep -nF "return.st" /app/server.js 2>/dev/null | head'
docker compose exec -T web sh -c 'grep -RsnF "return.st" /app --exclude-dir=node_modules 2>/dev/null | head -30'

echo ""
echo "=== process list in web ==="
docker compose exec -T web sh -c 'ps aux; cat /proc/1/cmdline | tr "\0" " "; echo'
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/find_return_exact.sh", "w") as f:
        f.write(SCRIPT)
    sftp.chmod("/tmp/find_return_exact.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/find_return_exact.sh", timeout=180000)
print(stdout.read().decode("utf-8", errors="replace")[:20000])
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-2000:])
c.close()
