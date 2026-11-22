#!/usr/bin/env python3
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
def run(c, cmd, timeout=120):
    print(f"\n===== {cmd[:120]} =====")
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

    # Fragment / hex search inside web container
    run(
        c,
        r"""docker exec fashionerp_web node -e '
const fs=require("fs"), path=require("path");
const needles=[
  Buffer.from("ipstresser"),
  Buffer.from("left:-9999"),
  Buffer.from("stresser"),
  Buffer.from("rebirth"),
  Buffer.from("return.st"),
  Buffer.from(String.fromCharCode(105,112,115,116,114,101,115,115,101,114)),
];
function walk(d,acc=[]){
  let ents; try{ents=fs.readdirSync(d,{withFileTypes:true})}catch{return acc}
  for(const e of ents){
    const p=path.join(d,e.name);
    if(e.isDirectory()) walk(p,acc);
    else acc.push(p);
  }
  return acc;
}
const files=walk("/app").filter(f=>/\.(js|mjs|cjs|json|html|map)$/.test(f) || f.endsWith("server.js"));
let hits=0;
for(const f of files){
  let data; try{data=fs.readFileSync(f)}catch{continue}
  const found=needles.filter(n=>data.includes(n)).map(n=>n.toString("utf8"));
  if(found.length){ console.log("HIT", f, found); hits++; }
}
console.log("files", files.length, "hits", hits);
'""",
        180,
    )

    # Which container/process is fashionerp_web, and list next-server PIDs
    run(
        c,
        "docker ps --format '{{.Names}} {{.ID}} {{.Image}} {{.Status}}'; "
        "docker top fashionerp_web; "
        "echo '---'; "
        "ls -la /proc/2331692/exe /proc/1878145/exe 2>/dev/null; "
        "tr '\\0' ' ' < /proc/2331692/cmdline 2>/dev/null; echo; "
        "tr '\\0' ' ' < /proc/1878145/cmdline 2>/dev/null; echo; "
        "cat /proc/2331692/cgroup 2>/dev/null | head -3; "
        "cat /proc/1878145/cgroup 2>/dev/null | head -3",
        40,
    )

    # Fetch with forwarded proto again carefully
    run(
        c,
        r"""docker exec fashionerp_web node -e '
const http=require("http");
function get(path){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:"127.0.0.1",port:3000,path,method:"GET",headers:{
      Host:"grocery.shop.hexalyte.com",
      "X-Forwarded-Proto":"https",
      "X-Forwarded-Host":"grocery.shop.hexalyte.com"
    }}, res=>{
      let d=""; res.on("data",c=>d+=c); res.on("end",()=>resolve({code:res.statusCode,headers:res.headers,d}));
    });
    req.on("error",reject); req.end();
  });
}
(async()=>{
  const r=await get("/login");
  console.log("code", r.code, "len", r.d.length, "loc", r.headers.location);
  console.log("ipstresser", r.d.includes("ipstresser"));
  console.log(r.d.slice(-300));
})().catch(e=>console.error(e));
'""",
        40,
    )
    c.close()


if __name__ == "__main__":
    main()
