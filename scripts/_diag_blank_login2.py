#!/usr/bin/env python3
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
def run(c, cmd, timeout=90):
    print(f"\n===== {cmd[:100]} =====")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    stdout.channel.settimeout(timeout)
    try:
        out = stdout.read().decode("utf-8", "replace")
    except Exception as e:
        out = f"[read failed] {e}\n"
        try:
            out += stdout.channel.recv(100000).decode("utf-8", "replace")
        except Exception:
            pass
    print(out[-15000:] if len(out) > 15000 else out)


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    print("connected")

    # Search patterns typical of this hijack
    run(
        c,
        "docker exec fashionerp_web sh -c "
        "\"grep -RsnF --binary-files=without-match 'free -h' /app 2>/dev/null | head -40\"",
        120,
    )
    run(
        c,
        "docker exec fashionerp_web sh -c "
        "\"grep -Rsn --binary-files=without-match -E 'child_process|execSync|exec\\(|spawnSync' "
        "/app/.next/server /app/server.js 2>/dev/null | head -50\"",
        120,
    )
    run(
        c,
        "docker exec fashionerp_web sh -c "
        "\"ls -la /app; ls -la /app/.next; ls /app/.next/server 2>/dev/null | head; "
        "wc -c /app/server.js 2>/dev/null; head -c 200 /app/server.js; echo\"",
        60,
    )
    # Check instrumentation / middleware / layout for eval
    run(
        c,
        "docker exec fashionerp_web sh -c "
        "\"grep -RsnF --binary-files=without-match 'require(\\\"child_process\\\")' /app 2>/dev/null | head -40; "
        "grep -RsnF --binary-files=without-match \\\"require('child_process')\\\" /app 2>/dev/null | head -40\"",
        120,
    )
    # Host filesystem - check if source or built artifacts poisoned
    run(
        c,
        "grep -RsnF --binary-files=without-match 'free -h' /opt/fashionerp/apps/web 2>/dev/null | head -20; "
        "grep -RsnF --binary-files=without-match 'authorized_keys' /opt/fashionerp/apps/web 2>/dev/null | head -20; "
        "ls -la /opt/fashionerp/apps/web/src/instrumentation* 2>/dev/null; "
        "ls -la /opt/fashionerp/apps/web/instrumentation* 2>/dev/null; "
        "find /opt/fashionerp/apps/web -name 'instrumentation.*' 2>/dev/null",
        60,
    )
    # Check nginx proxy to rebirth
    run(
        c,
        "docker exec fashionerp_nginx sh -c "
        "\"grep -nE 'rebirth|return.st|proxy_pass|rewrite' /etc/nginx/nginx.conf /etc/nginx/conf.d/* 2>/dev/null | head -40\"",
        40,
    )
    c.close()


if __name__ == "__main__":
    main()
