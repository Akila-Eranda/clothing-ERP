import sys, paramiko
from _ssh_config import ssh_connect_kwargs
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)
if sys.argv[1] == "put":
    sftp = c.open_sftp()
    for local, remote in zip(sys.argv[2::2], sys.argv[3::2]):
        sftp.put(local, remote)
        print("uploaded", remote)
    sftp.close()
else:
    i, o, e = c.exec_command(sys.argv[1], timeout=900)
    print(o.read().decode("utf-8", "replace")[-6000:])
    err = e.read().decode("utf-8", "replace")
    print("\n".join(l for l in err.splitlines() if "attribute `version`" not in l)[-2000:])
c.close()
