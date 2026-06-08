import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=r"pwrU\r*UGS£?8H2V$8]<qT", timeout=30)

cmds = [
    "grep -E 'CLOUDFLARE|ALLOWED' /opt/fashionerp/.env 2>/dev/null | sed 's/=.*/=***/'",
    "certbot certificates 2>/dev/null",
    "echo | openssl s_client -connect demo.shop.hexalyte.com:443 -servername demo.shop.hexalyte.com 2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null || echo 'demo ssl check failed'",
    "ls -la /opt/fashionerp/nginx/ssl/wildcard.shop.hexalyte.com/ 2>/dev/null",
]

for cmd in cmds:
    print(f"\n>>> {cmd[:80]}")
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode())
c.close()
