#!/usr/bin/env python3
import sys, time, paramiko
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
LOCAL = Path(r"E:\main ERP hexalyte\scripts\fashionerp-anti-miner.sh")

def connect():
    last=None
    for i in range(4):
        try:
            c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
            return c
        except Exception as e:
            last=e; time.sleep(2)
    raise last

c=connect()
with c.open_sftp() as sftp:
    # install updated anti-miner if cron uses /usr/local/bin or /opt path
    data = LOCAL.read_text(encoding="utf-8")
    for remote in ["/usr/local/bin/fashionerp-anti-miner.sh", "/opt/fashionerp/scripts/fashionerp-anti-miner.sh"]:
        try:
            with sftp.file(remote, "w") as f:
                f.write(data)
            sftp.chmod(remote, 0o755)
            print("wrote", remote)
        except Exception as e:
            print("skip", remote, e)

stdin,stdout,stderr=c.exec_command(
    "ls -la /usr/local/bin/fashionerp-anti-miner.sh /etc/cron.d/fashionerp* 2>/dev/null; "
    "grep -n fashionerp /etc/crontab /etc/cron.d/* 2>/dev/null | head -30; "
    "head -5 /var/log/fashionerp-anti-hijack.log 2>/dev/null; echo DONE",
    timeout=40, get_pty=True)
stdout.channel.settimeout(40)
print(stdout.read().decode("utf-8","replace"))
c.close()
