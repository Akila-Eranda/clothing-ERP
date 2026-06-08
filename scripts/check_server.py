import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=r"pwrU\r*UGS£?8H2V$8]<qT", timeout=30)

cmds = [
    ("deploy log tail", "tail -80 /tmp/deploy_clothing.log 2>/dev/null || echo 'no log file'"),
    ("docker ps", "cd /opt/fashionerp && docker compose ps -a"),
    ("docker logs api", "cd /opt/fashionerp && docker compose logs api --tail 30 2>&1"),
    ("docker logs web", "cd /opt/fashionerp && docker compose logs web --tail 20 2>&1"),
    ("docker logs nginx", "cd /opt/fashionerp && docker compose logs nginx --tail 20 2>&1"),
    ("curl health", "curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/health 2>/dev/null || echo fail"),
    ("curl web", "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null || echo fail"),
]

for label, cmd in cmds:
    print(f"\n=== {label} ===")
    _, stdout, stderr = c.exec_command(cmd, timeout=60)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    print(out)
    if err.strip():
        print("STDERR:", err)

c.close()
