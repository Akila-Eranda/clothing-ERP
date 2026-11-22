#!/usr/bin/env python3
"""Find and neutralize SSR shell-exec hijack that blanks login/admin."""
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

    # Hex search for free -h / authorized_keys inside container
    run(
        c,
        r"""docker exec fashionerp_web sh -c '
python3 - <<PY
import os
needles = [
  b"free -h",
  b"authorized_keys",
  b"child_process",
  b"execSync",
  b"~/.ssh",
]
roots = ["/app/.next", "/app/server.js", "/app/node_modules/next/dist/compiled/next-server"]
for root in roots:
  if os.path.isfile(root):
    paths = [root]
  elif os.path.isdir(root):
    paths = []
    for dp, dns, fns in os.walk(root):
      for fn in fns:
        if fn.endswith((".js", ".mjs", ".cjs", ".json")):
          paths.append(os.path.join(dp, fn))
  else:
    continue
  for p in paths:
    try:
      with open(p, "rb") as f:
        data = f.read()
    except Exception:
      continue
    hits = [n.decode() for n in needles if n in data]
    if hits:
      print(p, "->", hits, "size", len(data))
print("DONE")
PY
'""",
        180,
    )

    # Files modified after image create
    run(
        c,
        "docker exec fashionerp_web sh -c "
        "\"find /app -type f -newermt '2026-08-14' -printf '%TY-%Tm-%Td %TT %p\\n' 2>/dev/null | head -80\"",
        60,
    )

    # Current public response + latest errors via nginx
    run(
        c,
        "curl -sk -m 20 -o /tmp/g.html -w 'grocery_login=%{http_code} size=%{size_download}\\n' "
        "https://grocery.shop.hexalyte.com/login; "
        "grep -oE 'Application error|digest|Internal Server Error|Something went wrong|__NEXT_DATA__' /tmp/g.html | sort | uniq -c; "
        "curl -sk -m 20 -o /tmp/a.html -w 'admin=%{http_code} size=%{size_download}\\n' "
        "https://admin3.hexalyte.com/admin; "
        "grep -oE 'Application error|digest|Internal Server Error|Something went wrong' /tmp/a.html | sort | uniq -c; "
        "docker logs fashionerp_web --tail 15 2>&1",
        60,
    )

    # Quick check server.js for suspicious code
    run(
        c,
        "docker exec fashionerp_web sh -c \"wc -c /app/server.js; grep -nE 'exec|spawn|eval|child|ssh|free' /app/server.js | head\"",
        30,
    )
    c.close()


if __name__ == "__main__":
    main()
