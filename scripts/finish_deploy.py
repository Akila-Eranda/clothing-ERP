import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=r"pwrU\r*UGS£?8H2V$8]<qT", timeout=30)

cmds = [
    "cd /opt/fashionerp && docker compose exec -u root -T api npx prisma db push --accept-data-loss",
    "cd /opt/fashionerp && docker compose exec -u root -T api node prisma/seed.mjs",
    "curl -s http://localhost:3001/api/v1/health",
    "curl -s -o /dev/null -w 'nginx web: %{http_code}\n' http://95.217.14.198/",
    "curl -s -o /dev/null -w 'nginx api: %{http_code}\n' http://95.217.14.198/api/v1/health",
    "cd /opt/fashionerp && docker compose ps",
]

for cmd in cmds:
    print(f">>> {cmd}")
    _, stdout, stderr = c.exec_command(cmd, timeout=300)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print("ERR:", err)
    print()

c.close()
