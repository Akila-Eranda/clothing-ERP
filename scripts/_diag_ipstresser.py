#!/usr/bin/env python3
"""Find and remove ipstresser HTML injection causing blank/hijacked pages."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
def run(c, cmd, timeout=120):
    print(f"\n===== {cmd[:140]} =====")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    stdout.channel.settimeout(timeout)
    try:
        out = stdout.read().decode("utf-8", "replace")
    except Exception as e:
        out = f"[read failed] {e}"
    print(out[-14000:] if len(out) > 14000 else out)
    return out


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    print("connected")

    run(
        c,
        "grep -RsnF --binary-files=without-match 'ipstresser' /opt/fashionerp /etc/nginx 2>/dev/null | head -40; "
        "docker exec fashionerp_nginx sh -c \"grep -RsnF ipstresser /etc/nginx 2>/dev/null | head -40\"; "
        "docker exec fashionerp_web sh -c \"grep -RsnF ipstresser /app 2>/dev/null | head -40\"",
        90,
    )
    run(
        c,
        "docker exec fashionerp_nginx cat /etc/nginx/nginx.conf | head -350",
        40,
    )
    run(
        c,
        "docker exec fashionerp_web node -e '"
        "const fs=require(\"fs\");"
        "const b=fs.readFileSync(\"/app/server.js\",\"utf8\");"
        "console.log(b.includes(\"ipstresser\"), b.includes(\"</body>\"), b.length);"
        "console.log(b.slice(-800));"
        "'",
        30,
    )
    # Compare direct web vs via nginx
    run(
        c,
        "echo '--- direct web ---'; "
        "docker exec fashionerp_web wget -qO- http://127.0.0.1:3000/login 2>/dev/null | tail -c 400; echo; "
        "echo '--- via nginx ---'; "
        "curl -sk https://grocery.shop.hexalyte.com/login | tail -c 400; echo",
        40,
    )
    c.close()


if __name__ == "__main__":
    main()
