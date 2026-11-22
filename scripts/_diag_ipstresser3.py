#!/usr/bin/env python3
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
def run(c, cmd, timeout=60):
    print(f"\n===== {cmd[:120]} =====")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    stdout.channel.settimeout(timeout)
    try:
        out = stdout.read().decode("utf-8", "replace")
    except Exception as e:
        out = f"[read failed] {e}"
    print(out[-10000:] if len(out) > 10000 else out)
    return out


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    print("connected")

    run(c, "ss -lntp | grep -E ':80|:443|:3000' || netstat -lntp | grep -E ':80|:443|:3000'")
    run(c, "ps aux | grep -E 'nginx|node|next' | grep -v grep | head -40")
    run(
        c,
        r"""docker exec fashionerp_web node -e '
const http=require("http");
const opts={host:"127.0.0.1",port:3000,path:"/login",headers:{
  Host:"grocery.shop.hexalyte.com",
  "X-Forwarded-Proto":"https",
  "X-Forwarded-For":"1.2.3.4"
}};
http.get(opts, res=>{
  let d=""; res.on("data",c=>d+=c); res.on("end",()=>{
    console.log("status", res.statusCode, "len", d.length);
    console.log("has_ipstresser", d.includes("ipstresser"));
    console.log("TAIL:", d.slice(-400));
  });
}).on("error", e=>console.error(e));
'""",
    )
    # Fetch via docker nginx network from another container
    run(
        c,
        "docker exec fashionerp_nginx wget -qO- --header='Host: grocery.shop.hexalyte.com' "
        "http://fashionerp_web:3000/login 2>/dev/null | tail -c 400; echo; "
        "docker exec fashionerp_nginx wget -qO- --no-check-certificate "
        "--header='Host: grocery.shop.hexalyte.com' https://127.0.0.1/login 2>/dev/null | "
        "tail -c 400; echo",
    )
    # Search host nginx configs quickly
    run(
        c,
        "ls /etc/nginx 2>/dev/null; "
        "grep -RsnF ipstresser /etc/nginx /opt/fashionerp/nginx 2>/dev/null | head -20; "
        "docker inspect fashionerp_nginx --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'",
    )
    c.close()


if __name__ == "__main__":
    main()
