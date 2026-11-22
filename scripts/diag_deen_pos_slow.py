#!/usr/bin/env python3
"""Diagnose SL Deen POS slowness: product counts + barcode query timing."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from _ssh_config import HOST, USER, PASSWORD
JS = r"""
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const t = await p.tenant.findFirst({
    where: { OR: [{ subdomain: 'sl-deen-supermarket' }, { name: { contains: 'Deen', mode: 'insensitive' } }] },
    select: { id: true, name: true, subdomain: true },
  });
  console.log('TENANT', JSON.stringify(t));
  if (!t) { await p.$disconnect(); return; }
  const tid = t.id;
  const [products, variants, withImg, withBarcode] = await Promise.all([
    p.product.count({ where: { tenantId: tid, status: 'ACTIVE' } }),
    p.productVariant.count({ where: { isActive: true, product: { tenantId: tid, status: 'ACTIVE' } } }),
    p.product.count({ where: { tenantId: tid, status: 'ACTIVE', OR: [{ imageUrl: { not: null } }, { images: { isEmpty: false } }] } }).catch(() => -1),
    p.productVariant.count({ where: { isActive: true, barcode: { not: null }, product: { tenantId: tid, status: 'ACTIVE' } } }),
  ]);
  console.log('COUNTS', JSON.stringify({ products, variants, withImg, withBarcode }));

  const sample = await p.productVariant.findFirst({
    where: { isActive: true, barcode: { not: null }, product: { tenantId: tid, status: 'ACTIVE' } },
    select: { barcode: true, sku: true, name: true, product: { select: { name: true, barcode: true } } },
  });
  console.log('SAMPLE', JSON.stringify(sample));

  const t0 = Date.now();
  const key = sample?.barcode || 'NOSAMPLE';
  const hits = await p.productVariant.findMany({
    where: {
      isActive: true,
      product: { tenantId: tid, status: 'ACTIVE' },
      OR: [
        { sku: { equals: key, mode: 'insensitive' } },
        { barcode: key },
        { barcode: { equals: key, mode: 'insensitive' } },
        { product: { barcode: key } },
        { product: { barcode: { equals: key, mode: 'insensitive' } } },
        { sku: { contains: key, mode: 'insensitive' } },
        { name: { contains: key, mode: 'insensitive' } },
        { product: { name: { contains: key, mode: 'insensitive' } } },
      ],
    },
    include: {
      product: { include: { category: true, brand: true } },
      inventory: { take: 1 },
    },
    take: 50,
  });
  console.log('BARCODE_MS', Date.now() - t0, 'hits', hits.length);

  const t1 = Date.now();
  const all = await p.productVariant.findMany({
    where: { isActive: true, product: { tenantId: tid, status: 'ACTIVE' } },
    include: {
      product: { include: { category: true, brand: true } },
      inventory: { take: 1 },
    },
    take: 5000,
  });
  console.log('PRODUCTS_MS', Date.now() - t1, 'rows', all.length);
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
"""

DEPLOY = """#!/bin/bash
set -e
cat > /tmp/diag_deen_pos.js << 'EOF'
""" + JS + """
EOF
docker cp /tmp/diag_deen_pos.js fashionerp_api:/app/diag_deen_pos.js
docker exec -w /app fashionerp_api node diag_deen_pos.js
docker exec fashionerp_api rm -f /app/diag_deen_pos.js
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/diag_deen_pos.sh", "w") as f:
        f.write(DEPLOY)
    sftp.chmod("/tmp/diag_deen_pos.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/diag_deen_pos.sh", timeout=180000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
c.close()
