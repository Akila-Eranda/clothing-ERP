#!/usr/bin/env python3
"""Clean rebuild web container to kill runtime HTML injection (ipstresser)."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
def run(c, cmd, timeout=900):
    print(f"\n===== {cmd[:140]} =====")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    stdout.channel.settimeout(timeout)
    try:
        out = stdout.read().decode("utf-8", "replace")
    except Exception as e:
        out = f"[read failed] {e}"
    print(out[-16000:] if len(out) > 16000 else out)
    return out


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting...")
    c.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    print("Connected")

    # Pre-check infection + LD_PRELOAD
    run(
        c,
        "echo PRELOAD; docker exec fashionerp_web sh -c 'echo LD=$LD_PRELOAD; cat /proc/1/environ | tr \"\\0\" \"\\n\" | grep -i preload || true'; "
        "curl -sk https://grocery.shop.hexalyte.com/login | grep -o 'ipstresser' | head -3; "
        "echo ---; "
        "tr '\\0' '\\n' < /proc/2331692/environ 2>/dev/null | grep -Ei 'preload|node_options|require' || true",
        40,
    )

    # Reset to clean git + no-cache rebuild
    run(
        c,
        r"""bash -lc '
set -e
cd /opt/fashionerp
echo "==> git sync"
git fetch origin main
git reset --hard origin/main
echo "==> scan source for ipstresser"
grep -RsnF ipstresser apps nginx 2>/dev/null | head || echo clean_source
echo "==> rebuild web no-cache"
docker compose build --no-cache web
echo "==> recreate web"
docker compose up -d --force-recreate web
sleep 15
docker compose ps web
echo "==> verify"
curl -sk https://grocery.shop.hexalyte.com/login | tail -c 250; echo
curl -sk https://grocery.shop.hexalyte.com/login | grep -c ipstresser || echo "ipstresser_count=0"
curl -sk https://admin3.hexalyte.com/admin | grep -c ipstresser || echo "admin_ipstresser_count=0"
curl -sk -o /dev/null -w "login=%{http_code}\n" https://grocery.shop.hexalyte.com/login
curl -sk -o /dev/null -w "admin=%{http_code}\n" https://admin3.hexalyte.com/admin
echo DEPLOY_CLEAN_OK
'""",
        900,
    )
    c.close()


if __name__ == "__main__":
    main()
