#!/usr/bin/env python3
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
def run(c, cmd, timeout=180):
    print(f"\n===== {cmd[:120]} =====")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    stdout.channel.settimeout(timeout)
    try:
        out = stdout.read().decode("utf-8", "replace")
    except Exception as e:
        out = f"[read failed] {e}"
    print(out[-16000:] if len(out) > 16000 else out)


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    print("connected")

    # Use node for binary search
    run(
        c,
        r"""docker exec fashionerp_web node -e '
const fs=require("fs"); const path=require("path");
const needles=[Buffer.from("free -h"),Buffer.from("authorized_keys"),Buffer.from("execSync("),Buffer.from("child_process")];
function walk(d, acc=[]) {
  let ents; try { ents=fs.readdirSync(d,{withFileTypes:true}); } catch { return acc; }
  for (const e of ents) {
    const p=path.join(d,e.name);
    if (e.isDirectory()) {
      if (e.name==="node_modules" && !d.includes("/.next")) continue;
      walk(p,acc);
    } else if (/\.(js|mjs|cjs|json)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const files=walk("/app/.next").concat(["/app/server.js"]);
let hits=0;
for (const f of files) {
  let data; try { data=fs.readFileSync(f); } catch { continue; }
  const found=needles.filter(n=>data.includes(n)).map(n=>n.toString());
  if (found.length) { console.log(f, found, data.length); hits++; }
}
console.log("FILES", files.length, "HITS", hits);
'""",
        180,
    )

    # Trigger fresh request and show NEW logs only
    run(
        c,
        "docker logs fashionerp_web --tail 1 >/dev/null; "
        "curl -sk -m 20 -A 'diag-scan' https://grocery.shop.hexalyte.com/login >/dev/null; "
        "curl -sk -m 20 -A 'diag-scan' https://admin3.hexalyte.com/admin >/dev/null; "
        "sleep 1; docker logs fashionerp_web --tail 40 2>&1",
        60,
    )

    # Check if error is only in cached old logs - also inspect HTML for error UI
    run(
        c,
        "curl -sk -m 20 https://grocery.shop.hexalyte.com/login | tr '>' '>\\n' | grep -E 'error|Error|digest|failed|blank|Application' | head -40; "
        "echo '---'; "
        "curl -sk -m 20 https://admin3.hexalyte.com/admin | tr '>' '>\\n' | grep -E 'error|Error|digest|failed|Application|login' | head -40",
        40,
    )
    c.close()


if __name__ == "__main__":
    main()
