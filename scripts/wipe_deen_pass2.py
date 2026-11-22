#!/usr/bin/env python3
"""Second-pass wipe for leftover FK-blocked deen data."""
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "95.217.14.198"
USER = "root"
from _ssh_config import PASSWORD
TID = "cmrbqxbfe000h5bfdh4ntxtva"

NODE = r"""
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const TID = 'cmrbqxbfe000h5bfdh4ntxtva';

async function q(label, sql) {
  try {
    const n = await prisma.$executeRawUnsafe(sql);
    console.log('OK', label, n);
  } catch (e) {
    console.log('SKIP', label, (e.message || String(e)).slice(0, 200));
  }
}

(async () => {
  console.log('PASS2', TID);

  // Returns / refunds blocking sales
  await q('return_items', `DELETE FROM return_items WHERE "returnId" IN (SELECT id FROM returns WHERE "tenantId"='${TID}')`);
  await q('returns', `DELETE FROM returns WHERE "tenantId"='${TID}'`);
  await q('sale_returns', `DELETE FROM sale_returns WHERE "tenantId"='${TID}'`);

  // Sale children again then sales
  await q('sale_payments', `DELETE FROM sale_payments WHERE "saleId" IN (SELECT id FROM sales WHERE "tenantId"='${TID}')`);
  await q('sale_items', `DELETE FROM sale_items WHERE "saleId" IN (SELECT id FROM sales WHERE "tenantId"='${TID}')`);
  await q('sales', `DELETE FROM sales WHERE "tenantId"='${TID}'`);

  // Supplier payments blocking suppliers
  await q('supplier_payment_allocations', `DELETE FROM supplier_payment_allocations WHERE "paymentId" IN (SELECT id FROM supplier_payments WHERE "tenantId"='${TID}')`);
  await q('supplier_payments', `DELETE FROM supplier_payments WHERE "tenantId"='${TID}'`);
  await q('supplier_invoice_items', `DELETE FROM supplier_invoice_items WHERE "invoiceId" IN (SELECT id FROM supplier_invoices WHERE "tenantId"='${TID}')`);
  await q('supplier_invoices', `DELETE FROM supplier_invoices WHERE "tenantId"='${TID}'`);
  await q('suppliers', `DELETE FROM suppliers WHERE "tenantId"='${TID}'`);

  // Inventory blocking variants/products/warehouses
  await q('inventory_movements', `DELETE FROM inventory_movements WHERE "tenantId"='${TID}'`);
  await q('inventory', `DELETE FROM inventory WHERE "tenantId"='${TID}'`);
  await q('inventory_lots', `DELETE FROM inventory_lots WHERE "tenantId"='${TID}'`);
  await q('stock_levels', `DELETE FROM stock_levels WHERE "tenantId"='${TID}'`);
  await q('product_images', `DELETE FROM product_images WHERE "productId" IN (SELECT id FROM products WHERE "tenantId"='${TID}')`);
  await q('product_variants', `DELETE FROM product_variants WHERE "productId" IN (SELECT id FROM products WHERE "tenantId"='${TID}')`);
  await q('products', `DELETE FROM products WHERE "tenantId"='${TID}'`);
  await q('warehouses', `DELETE FROM warehouses WHERE "tenantId"='${TID}'`);

  // Journal lines (correct join)
  await q('journal_lines', `DELETE FROM journal_lines WHERE "entryId" IN (SELECT id FROM journal_entries WHERE "tenantId"='${TID}')`);
  await q('journal_entries', `DELETE FROM journal_entries WHERE "tenantId"='${TID}'`);

  // Stock count items table name variants
  await q('stock_count_lines', `DELETE FROM stock_count_lines WHERE "sessionId" IN (SELECT id FROM stock_count_sessions WHERE "tenantId"='${TID}')`);
  await q('stock_count_items', `DELETE FROM stock_count_items WHERE "sessionId" IN (SELECT id FROM stock_count_sessions WHERE "tenantId"='${TID}')`);
  await q('stock_count_sessions', `DELETE FROM stock_count_sessions WHERE "tenantId"='${TID}'`);

  // Any leftover GRN/PO children
  await q('goods_receipt_items', `DELETE FROM goods_receipt_items WHERE "receiptId" IN (SELECT id FROM goods_receipts WHERE "tenantId"='${TID}')`);
  await q('goods_receipts', `DELETE FROM goods_receipts WHERE "tenantId"='${TID}'`);
  await q('purchase_order_items', `DELETE FROM purchase_order_items WHERE "purchaseOrderId" IN (SELECT id FROM purchase_orders WHERE "tenantId"='${TID}')`);
  await q('purchase_orders', `DELETE FROM purchase_orders WHERE "tenantId"='${TID}'`);

  // Pos holds / drafts
  await q('pos_holds', `DELETE FROM pos_holds WHERE "tenantId"='${TID}'`);
  await q('held_carts', `DELETE FROM held_carts WHERE "tenantId"='${TID}'`);

  const left = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*) FROM sales WHERE "tenantId"='${TID}') AS sales,
      (SELECT COUNT(*) FROM products WHERE "tenantId"='${TID}') AS products,
      (SELECT COUNT(*) FROM customers WHERE "tenantId"='${TID}') AS customers,
      (SELECT COUNT(*) FROM suppliers WHERE "tenantId"='${TID}') AS suppliers,
      (SELECT COUNT(*) FROM users WHERE "tenantId"='${TID}') AS users,
      (SELECT COUNT(*) FROM inventory WHERE "tenantId"='${TID}') AS inventory,
      (SELECT COUNT(*) FROM journal_entries WHERE "tenantId"='${TID}') AS journals
  `);
  console.log('LEFT', JSON.stringify(left));
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
docker compose cp /tmp/wipe_deen_pass2.js api:/app/wipe_deen_pass2.js
docker compose exec -T -w /app api node wipe_deen_pass2.js
docker compose exec -T -w /app api rm -f wipe_deen_pass2.js
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)
with c.open_sftp() as sftp:
    with sftp.file("/tmp/wipe_deen_pass2.js", "w") as f:
        f.write(NODE)
    with sftp.file("/tmp/wipe_deen_pass2.sh", "w") as f:
        f.write(BASH)
    sftp.chmod("/tmp/wipe_deen_pass2.sh", 0o755)
_, stdout, stderr = c.exec_command("bash /tmp/wipe_deen_pass2.sh", timeout=300000)
for line in iter(stdout.readline, ""):
    if not line:
        break
    print(line, end="", flush=True)
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err[-3000:])
code = stdout.channel.recv_exit_status()
print(f"exit={code}")
c.close()
sys.exit(code)
