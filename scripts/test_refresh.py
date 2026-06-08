import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=r"pwrU\r*UGS£?8H2V$8]<qT", timeout=30)

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
