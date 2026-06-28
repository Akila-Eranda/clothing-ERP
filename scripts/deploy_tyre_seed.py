#!/usr/bin/env python3
"""Upload regenerated seed.js and run seed for Tyre Shop demo tenant."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
LOCAL = r"e:\clothing shop\apps\api\prisma\seed.js"
REMOTE = "/opt/fashionerp/apps/api/prisma/seed.js"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

with c.open_sftp() as sftp:
    print(f"Uploading {LOCAL} -> {REMOTE}")
    sftp.put(LOCAL, REMOTE)

_, stdout, stderr = c.exec_command(
    "cd /opt/fashionerp && docker compose cp apps/api/prisma/seed.js api:/app/prisma/seed.js && "
    "docker compose exec -u root -T api node prisma/seed.js",
    timeout=180,
)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print(out)
if err.strip():
    print("STDERR:", err[-4000:])
c.close()
