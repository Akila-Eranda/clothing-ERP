#!/usr/bin/env python3
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
def run(c, cmd, timeout=90):
    print(f"\n===== {cmd[:130]} =====")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout, get_pty=True)
    stdout.channel.settimeout(timeout)
    try:
        out = stdout.read().decode("utf-8", "replace")
    except Exception as e:
        out = f"[read failed] {e}"
    print(out[-12000:] if len(out) > 12000 else out)
    return out


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=25)
    print("connected")

    # Direct from web container (bypass nginx)
    run(
        c,
        r"""docker exec fashionerp_web node -e '
const http=require("http");
http.get({host:"127.0.0.1",port:3000,path:"/login",headers:{Host:"grocery.shop.hexalyte.com"}}, res=>{
  let d=""; res.on("data",c=>d+=c); res.on("end",()=>{
    console.log("status", res.statusCode, "len", d.length);
    console.log("has_ipstresser", d.includes("ipstresser"));
    console.log("TAIL:", d.slice(-350));
  });
}).on("error", e=>console.error(e));
'""",
        40,
    )

    # Search obfuscated / char-code forms inside web + nginx image layers
    run(
        c,
        r"""docker exec fashionerp_web node -e '
const fs=require("fs"), path=require("path");
const needles=["ipstresser","ipstresser.rs","rebirthstress","return.st"];
function walk(d,acc=[]){
  let ents; try{ents=fs.readdirSync(d,{withFileTypes:true})}catch{return acc}
  for(const e of ents){
    const p=path.join(d,e.name);
    if(e.isDirectory()){ if(e.name==="node_modules"&&!p.includes("/.next")) continue; walk(p,acc);}
    else if(/\.(js|mjs|cjs|html|tsx|ts|json)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const files=walk("/app");
let hits=0;
for(const f of files){
  let t; try{t=fs.readFileSync(f,"utf8")}catch{continue}
  for(const n of needles){
    if(t.includes(n)){ console.log("HIT", n, f); hits++; }
  }
}
console.log("checked", files.length, "hits", hits);
'""",
        120,
    )

    # Host processes listening / suspicious
    run(
        c,
        "ss -lntp | head -40; "
        "ps aux --sort=-%cpu | head -25; "
        "grep -RsnF ipstresser /var /usr/local /root 2>/dev/null | head -30; "
        "ls -la /opt/fashionerp/nginx/; "
        "md5sum /opt/fashionerp/nginx/nginx.clothing.conf; "
        "docker exec fashionerp_nginx md5sum /etc/nginx/nginx.conf",
        60,
    )

    # Check if layout source on host has injection
    run(
        c,
        "grep -RsnF ipstresser /opt/fashionerp/apps/web/src 2>/dev/null | head; "
        "tail -c 500 /opt/fashionerp/apps/web/src/app/layout.tsx; echo; "
        "wc -l /opt/fashionerp/apps/web/src/app/layout.tsx",
        30,
    )
    c.close()


if __name__ == "__main__":
    main()
