import paramiko
from _ssh_config import ssh_connect_kwargs
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)

with open(r"e:\clothing shop\scripts\test_refresh.sh") as f:
    script = f.read()

sftp = c.open_sftp()
with sftp.file("/tmp/test_refresh.sh", "w") as f:
    f.write(script)
sftp.chmod("/tmp/test_refresh.sh", 0o755)
sftp.close()

_, o, e = c.exec_command("bash /tmp/test_refresh.sh", timeout=60)
print(o.read().decode())
print(e.read().decode())
c.close()
