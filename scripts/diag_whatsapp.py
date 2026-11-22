#!/usr/bin/env python3
import sys
from _ssh_config import ssh_connect_kwargs
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)
_, o, e = c.exec_command(
    r"""
echo '===== API WA LOGS ====='
docker logs --tail 200 fashionerp_api 2>&1 | grep -iE 'whatsapp|baileys|qr|WA_|session' | tail -60
echo
echo '===== SESSION DIR ====='
docker exec -u root fashionerp_api sh -c 'ls -la /app/uploads/whatsapp-sessions 2>/dev/null || ls -la /tmp/whatsapp-sessions 2>/dev/null; find /app/uploads /tmp -maxdepth 3 -type d -iname "*whats*" 2>/dev/null'
echo
echo '===== PACKAGE ====='
docker exec fashionerp_api sh -c 'ls node_modules/@whiskeysockets/baileys 2>/dev/null | head -5; node -e "try{console.log(require.resolve(\"@whiskeysockets/baileys\"))}catch(e){console.log(e.message)}"'
echo
echo '===== API HEALTH ====='
curl -sk https://shop.clothing.api.hexalyte.com/api/v1/health | head -c 200; echo
""",
    timeout=60,
)
print(o.read().decode("utf-8", "replace"))
err = e.read().decode("utf-8", "replace")
if err.strip():
    print("STDERR:", err[-2000:])
c.close()
