#!/usr/bin/env python3
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _ssh_config import HOST, USER, PASSWORD
JS = r'''
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const tid = "cmrbqxbfe000h5bfdh4ntxtva";
  const branch = await p.branch.findFirst({ where: { tenantId: tid }, select: { id: true } });
  const bid = branch.id;
  const t0 = Date.now();
  const n = await p.productVariant.count({ where: { isActive: true, product: { tenantId: tid, status: "ACTIVE" } } });
  console.log("COUNT", n, "ms", Date.now() - t0);
  const t1 = Date.now();
  const rows = await p.productVariant.findMany({
    where: { isActive: true, product: { tenantId: tid, status: "ACTIVE" } },
    select: {
      id: true, sku: true, barcode: true, sellingPrice: true, costPrice: true, mrp: true, name: true, productId: true,
      product: {
        select: {
          name: true, barcode: true, taxRate: true, productKind: true, unit: true,
          allowDecimalSelling: true, weightScaleReady: true, warrantyMonths: true,
          category: { select: { name: true } },
        },
      },
      inventory: { where: { branchId: bid }, select: { quantity: true, reservedQty: true }, take: 1 },
    },
    take: 12000,
    orderBy: [{ product: { name: "asc" } }, { name: "asc" }],
  });
  console.log("SLIM_ROWS", rows.length, "ms", Date.now() - t1, "json_kb", Math.round(JSON.stringify(rows).length / 1024));
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
'''

script = """#!/bin/bash
set -e
cat > /tmp/deen_perf.js << 'EOF'
""" + JS + """
EOF
docker cp /tmp/deen_perf.js fashionerp_api:/app/deen_perf.js
docker exec -w /app fashionerp_api node deen_perf.js
docker exec fashionerp_api rm -f /app/deen_perf.js
grep -n 'limit ?? 10000\\|12000' /opt/fashionerp/apps/api/src/modules/pos/pos.module.ts | head -5
grep -n 'limit=12000\\|applySoldStockLocally' /opt/fashionerp/apps/web/src/components/pos/pos-overlay.tsx | head -5
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/deen_perf.sh", "w") as f:
        f.write(script)
    sftp.chmod("/tmp/deen_perf.sh", 0o755)
_, o, e = c.exec_command("bash /tmp/deen_perf.sh", timeout=120000)
print(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("ERR", err[-2000:])
c.close()
