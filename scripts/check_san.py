import paramiko
from _ssh_config import ssh_connect_kwargs
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)
cmd = "echo | openssl s_client -connect demo.shop.hexalyte.com:443 -servername demo.shop.hexalyte.com 2>/dev/null | openssl x509 -noout -text | grep -A1 'Subject Alternative Name'"
_, o, _ = c.exec_command(cmd, timeout=20)
print(o.read().decode())
c.close()
