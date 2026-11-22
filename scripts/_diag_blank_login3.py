#!/usr/bin/env python3
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
def run(c, cmd, timeout=90):
    print(f"\n===== CMD =====\n{cmd[:200]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    stdout.channel.settimeout(timeout)
    try:
        out = stdout.read().decode("utf-8", "replace")
    except Exception as e:
        out = f"[read failed] {e}"
    print(out[-12000:] if len(out) > 12000 else out)


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    print("connected")

    run(c, "docker inspect fashionerp_web --format '{{json .Config.Env}}' '{{.Config.Cmd}}' '{{.Config.Entrypoint}}' '{{.HostConfig.Binds}}'")
    run(c, "docker exec fashionerp_web sh -c 'echo NODE_OPTIONS=$NODE_OPTIONS; ls -la /app; ls -la /docker-entrypoint* 2>/dev/null; cat /proc/1/environ | tr \"\\0\" \"\\n\" | head -40'")
    run(c, "docker exec fashionerp_web sh -c 'ls -la /tmp /home/nextjs 2>/dev/null; find /home/nextjs /tmp /app -maxdepth 3 -type f \\( -name \"*.js\" -o -name \".*\" \\) 2>/dev/null | head -80'")
    # strings that often appear in obfuscated shells
    run(
        c,
        "docker exec fashionerp_web sh -c "
        "\"grep -RsnF --binary-files=without-match authorized /app/.next/server 2>/dev/null | head -30; "
        "grep -RsnF --binary-files=without-match 'free -' /app/.next 2>/dev/null | head -20; "
        "grep -Raln --binary-files=without-match 'execSync' /app/.next/server 2>/dev/null | head -30\"",
        120,
    )
    # Check host-side infection that mounts into containers
    run(
        c,
        "ls -la /opt/fashionerp/apps/web/node_modules 2>/dev/null | head; "
        "find /opt/fashionerp -name '*.js' -size -50k 2>/dev/null | xargs grep -lF 'authorized_keys' 2>/dev/null | head -20; "
        "find /opt/fashionerp -name '*.js' -size -50k 2>/dev/null | xargs grep -lF 'free -h' 2>/dev/null | head -20; "
        "crontab -l 2>/dev/null; ls /etc/cron.d 2>/dev/null; "
        "grep -RsnF 'authorized_keys\\|free -h\\|child_process' /etc/cron* /var/spool/cron 2>/dev/null | head -20",
        90,
    )
    # Hit login and capture fresh error
    run(
        c,
        "curl -s -m 15 -o /dev/null -w 'login=%{http_code}\\n' http://127.0.0.1:3000/login; "
        "curl -s -m 15 -o /dev/null -w 'admin=%{http_code}\\n' http://127.0.0.1:3000/admin; "
        "docker logs fashionerp_web --since 30s 2>&1 | tail -40",
        60,
    )
    c.close()


if __name__ == "__main__":
    main()
