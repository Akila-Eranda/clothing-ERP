import paramiko
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=r"pwrU\r*UGS£?8H2V$8]<qT", timeout=30)
cmd = "echo | openssl s_client -connect demo.shop.hexalyte.com:443 -servername demo.shop.hexalyte.com 2>/dev/null | openssl x509 -noout -text | grep -A1 'Subject Alternative Name'"
_, o, _ = c.exec_command(cmd, timeout=20)
print(o.read().decode())
c.close()
