import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("95.217.14.198", username="root", password=r"pwrU\r*UGS£?8H2V$8]<qT", timeout=30)

tests = [
    ("tenant blocked", """curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/platform-login -H 'Content-Type: application/json' -d '{"email":"admin@demo.fashionerp.com","password":"Admin@123456"}'"""),
    ("company admin ok", """curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/platform-login -H 'Content-Type: application/json' -d '{"email":"admin@hexalyte.com","password":"Admin@123456"}'"""),
    ("shop admin login ok", """curl -sk -X POST https://shop.clothing.api.hexalyte.com/api/v1/auth/login -H 'Content-Type: application/json' -H 'x-tenant-id: demo' -d '{"email":"admin@demo.fashionerp.com","password":"Admin@123456"}'"""),
    ("shop /admin blocked", "curl -skI https://shop.hexalyte.com/admin | head -3"),
    ("admin3 login page", "curl -skI https://admin3.hexalyte.com/admin/login | head -3"),
]

for label, cmd in tests:
    print(f"\n=== {label} ===")
    _, o, _ = c.exec_command(cmd, timeout=30)
    print(o.read().decode("utf-8", errors="replace")[:400])

c.close()
