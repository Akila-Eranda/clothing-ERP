#!/usr/bin/env python3
"""Test file upload API on production."""
import json
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

TEST = r"""#!/bin/bash
set -e
TOKEN=$(curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -H 'x-tenant-id: spareparts' \
  -d '{"email":"admin@spareparts.demo.fashionerp.com","password":"Admin@123456"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['accessToken'])")

echo "token ok"

# 1x1 png
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82' > /tmp/test-logo.png

HTTP=$(curl -sk -o /tmp/upload_resp.json -w '%{http_code}' -X POST \
  https://shop.clothing.api.hexalyte.com/api/v1/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-tenant-id: cmqbqjexn004sblgxl61wr4xh' \
  -F 'file=@/tmp/test-logo.png;type=image/png' \
  -F 'folder=receipts')

echo "HTTP $HTTP"
cat /tmp/upload_resp.json
echo
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with client.open_sftp() as sftp:
    with sftp.file("/tmp/test_upload.sh", "w") as f:
        f.write(TEST)
    sftp.chmod("/tmp/test_upload.sh", 0o755)
_, stdout, stderr = client.exec_command("bash /tmp/test_upload.sh", timeout=60)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err)
client.close()
