import sys, paramiko
from _ssh_config import ssh_connect_kwargs
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(**ssh_connect_kwargs(), timeout=30)
sql = sys.stdin.read()
cmd = 'cd /opt/fashionerp && docker compose exec -T postgres sh -c \'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"\''
i, o, e = c.exec_command(cmd, timeout=120)
i.write(sql)
i.channel.shutdown_write()
print(o.read().decode("utf-8", "replace"))
err = e.read().decode("utf-8", "replace")
print("\n".join(l for l in err.splitlines() if "version" not in l))
c.close()
