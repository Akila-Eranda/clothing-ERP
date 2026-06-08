import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=r"pwrU\r*UGS£?8H2V$8]<qT", timeout=30)

cmd = "cd /opt/fashionerp && docker compose exec -u root -T api node prisma/seed.js"
_, stdout, stderr = c.exec_command(cmd, timeout=120)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("ERR:", err)
c.close()
