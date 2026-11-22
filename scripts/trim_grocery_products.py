#!/usr/bin/env python3
"""Keep ~10 products on grocery.shop.hexalyte.com; delete the rest."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD

NODE = r"""
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const SUB = 'grocery';
const KEEP_N = 10;

async function q(label, sql) {
  try {
    const n = await prisma.$executeRawUnsafe(sql);
    console.log('OK', label, n);
    return n;
  } catch (e) {
    console.log('SKIP', label, (e.message || String(e)).slice(0, 220));
    return 0;
  }
}

(async () => {
  const tenant = await prisma.tenant.findUnique({ where: { subdomain: SUB } });
  if (!tenant) {
    console.log('TENANT_NOT_FOUND', SUB);
    process.exit(2);
  }
  const tid = tenant.id;
  console.log('TENANT', tid, tenant.name, tenant.subdomain);

  const before = await prisma.product.count({ where: { tenantId: tid } });
  console.log('PRODUCTS_BEFORE', before);

  const keepRows = await prisma.$queryRawUnsafe(`
    SELECT id, name, sku
    FROM products
    WHERE "tenantId" = '${tid}'
    ORDER BY cardinality(images) DESC NULLS LAST, "updatedAt" DESC, "createdAt" ASC
    LIMIT ${KEEP_N}
  `);
  const keepIds = keepRows.map((r) => r.id);
  console.log('KEEP', keepRows.map((r) => `${r.name} [${r.sku}]`).join(' | '));

  if (keepIds.length === 0) {
    console.log('NO_PRODUCTS');
    await prisma.$disconnect();
    return;
  }

  const inKeep = keepIds.map((id) => `'${id}'`).join(',');
  const delProducts = `SELECT id FROM products WHERE "tenantId"='${tid}' AND id NOT IN (${inKeep})`;
  const delVariants = `SELECT pv.id FROM product_variants pv WHERE pv."productId" IN (${delProducts})`;

  await q('inventory_logs', `DELETE FROM inventory_logs WHERE "variantId" IN (${delVariants})`);
  await q('inventory_movements', `DELETE FROM inventory_movements WHERE "variantId" IN (${delVariants})`);
  await q('inventory_reservations', `DELETE FROM inventory_reservations WHERE "variantId" IN (${delVariants})`);
  await q('inventory_lots', `DELETE FROM inventory_lots WHERE "variantId" IN (${delVariants})`);
  await q('inventory', `DELETE FROM inventory WHERE "variantId" IN (${delVariants})`);
  await q('stock_levels', `DELETE FROM stock_levels WHERE "variantId" IN (${delVariants})`);
  await q('stock_transfer_items', `DELETE FROM stock_transfer_items WHERE "variantId" IN (${delVariants})`);
  await q('stock_count_lines', `DELETE FROM stock_count_lines WHERE "variantId" IN (${delVariants})`);
  await q('stock_count_items', `DELETE FROM stock_count_items WHERE "variantId" IN (${delVariants})`);
  await q('sale_items', `DELETE FROM sale_items WHERE "variantId" IN (${delVariants})`);
  await q('return_items', `DELETE FROM return_items WHERE "variantId" IN (${delVariants})`);
  await q('purchase_order_items', `DELETE FROM purchase_order_items WHERE "variantId" IN (${delVariants})`);
  await q('purchase_request_items', `DELETE FROM purchase_request_items WHERE "variantId" IN (${delVariants})`);
  await q('goods_receipt_items', `DELETE FROM goods_receipt_items WHERE "variantId" IN (${delVariants})`);
  await q('supplier_return_items', `DELETE FROM supplier_return_items WHERE "variantId" IN (${delVariants})`);
  await q('supplier_product_assignments', `DELETE FROM supplier_product_assignments WHERE "variantId" IN (${delVariants})`);
  await q('quotation_items', `DELETE FROM quotation_items WHERE "variantId" IN (${delVariants})`);
  await q('job_card_lines', `DELETE FROM job_card_lines WHERE "variantId" IN (${delVariants})`);
  await q('tyre_serials', `DELETE FROM tyre_serials WHERE "variantId" IN (${delVariants})`);
  await q('warranty_claims', `DELETE FROM warranty_claims WHERE "variantId" IN (${delVariants})`);
  await q('part_compatibilities', `DELETE FROM part_compatibilities WHERE "variantId" IN (${delVariants})`);
  await q('held_cart_items', `DELETE FROM held_cart_items WHERE "variantId" IN (${delVariants})`);
  await q('pos_hold_items', `DELETE FROM pos_hold_items WHERE "variantId" IN (${delVariants})`);

  await q('collection_products', `DELETE FROM collection_products WHERE "productId" IN (${delProducts})`);
  await q('promotion_products', `DELETE FROM promotion_products WHERE "productId" IN (${delProducts})`);
  await q('product_images', `DELETE FROM product_images WHERE "productId" IN (${delProducts})`);

  await q('product_variants', `DELETE FROM product_variants WHERE "productId" IN (${delProducts})`);
  await q('products', `DELETE FROM products WHERE "tenantId"='${tid}' AND id NOT IN (${inKeep})`);

  const after = await prisma.product.count({ where: { tenantId: tid } });
  const left = await prisma.product.findMany({
    where: { tenantId: tid },
    select: { name: true, sku: true },
    orderBy: { name: 'asc' },
  });
  console.log('PRODUCTS_AFTER', after);
  console.log('LEFT_NAMES', left.map((p) => p.name).join(' | '));
  console.log('DONE');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('ERROR', e);
  await prisma.$disconnect();
  process.exit(1);
});
"""

BASH = """#!/bin/bash
set -e
cd /opt/fashionerp
docker compose cp /tmp/trim_grocery_products.js api:/app/trim_grocery_products.js
docker compose exec -T -w /app api node trim_grocery_products.js
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/trim_grocery_products.js", "w") as f:
        f.write(NODE)
    with sftp.file("/tmp/trim_grocery_products.sh", "w") as f:
        f.write(BASH)
    sftp.chmod("/tmp/trim_grocery_products.sh", 0o755)
print("Running trim...")
_, stdout, stderr = c.exec_command("bash /tmp/trim_grocery_products.sh", timeout=600000)
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-5000:])
c.close()
