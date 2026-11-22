#!/usr/bin/env python3
import sys
import time
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
def run(c, cmd, timeout=60):
    print(f"\n$ {cmd[:120]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    stdout.channel.settimeout(timeout)
    try:
        out = stdout.read().decode("utf-8", "replace")
    except Exception as e:
        out = f"[read failed] {e}"
    try:
        err = stderr.read().decode("utf-8", "replace")
    except Exception:
        err = ""
    print(out[-12000:] if len(out) > 12000 else out)
    if err.strip():
        print("STDERR:", err[-3000:])


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    print("connected")

    run(c, "docker logs fashionerp_web --tail 50 2>&1 | tail -50", 45)
    run(
        c,
        "docker exec fashionerp_web sh -c 'grep -RsnF authorized_keys /app/.next 2>/dev/null | head -30; "
        "grep -RsnF \"cat ~/.ssh\" /app 2>/dev/null | head -30; "
        "grep -RsnF execSync /app/.next/server 2>/dev/null | head -20'",
        90,
    )
    run(
        c,
        "docker exec fashionerp_web sh -c '"
        "find /app -type f \\( -name \"*.js\" -o -name \"*.mjs\" \\) ! -path \"*/node_modules/*\" "
        "-print0 2>/dev/null | xargs -0 grep -lF authorized_keys 2>/dev/null | head -20'",
        90,
    )
    run(
        c,
        "curl -s -o /tmp/login.html -w 'code=%{http_code} size=%{size_download}\\n' "
        "http://127.0.0.1:3000/login; wc -c /tmp/login.html; "
        "grep -E 'Error|authorized|Application error|digest' /tmp/login.html | head -10; "
        "head -c 500 /tmp/login.html; echo",
        30,
    )
    # check if malware in node next runtime
    run(
        c,
        "docker exec fashionerp_web sh -c '"
        "grep -lF authorized_keys "
        "$(find /app/node_modules/next -name \"app-page.runtime.prod.js\" 2>/dev/null) "
        "2>/dev/null; "
        "grep -nF authorized_keys "
        "/app/node_modules/next/dist/compiled/next-server/app-page.runtime.prod.js "
        "2>/dev/null | head -5'",
        60,
    )
    c.close()


if __name__ == "__main__":
    main()
