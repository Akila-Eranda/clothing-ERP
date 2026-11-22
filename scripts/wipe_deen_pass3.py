#!/usr/bin/env python3
"""Wipe remaining deen catalog + variant FK children."""
import paramiko

HOST, USER, PASS = "95.217.14.198", "root", "FrCnCXMdTgiu"
TID = "cmrbqxbfe000h5bfdh4ntxtva"
DB = "fashionerp_db"

SQL = f"""
BEGIN;

-- Variant-scoped children for this tenant's products
WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM inventory_reservations WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM inventory_logs WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM inventory WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM inventory_lots WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM stock_count_lines WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM stock_transfer_items WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM part_compatibilities WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM warranty_claims WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM quotation_items WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM job_card_lines WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM tyre_serials WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM supplier_product_assignments WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM purchase_order_items WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM purchase_request_items WHERE "variantId" IN (SELECT id FROM v);

WITH v AS (
  SELECT pv.id FROM product_variants pv
  JOIN products p ON p.id = pv."productId"
  WHERE p."tenantId" = '{TID}'
)
DELETE FROM goods_receipt_items WHERE "variantId" IN (SELECT id FROM v);

-- Tenant-scoped leftovers
DELETE FROM inventory_logs WHERE "tenantId" = '{TID}';
DELETE FROM inventory_reservations WHERE "tenantId" = '{TID}';
DELETE FROM inventory WHERE "tenantId" = '{TID}';
DELETE FROM stock_count_sessions WHERE "tenantId" = '{TID}';
DELETE FROM stock_transfers WHERE "tenantId" = '{TID}';
DELETE FROM quotations WHERE "tenantId" = '{TID}';
DELETE FROM job_cards WHERE "tenantId" = '{TID}';
DELETE FROM warranty_claims WHERE "tenantId" = '{TID}';

DELETE FROM product_variants
WHERE "productId" IN (SELECT id FROM products WHERE "tenantId" = '{TID}');

DELETE FROM products WHERE "tenantId" = '{TID}';

COMMIT;

SELECT t, n FROM (
  SELECT 'sales' t, count(*)::int n FROM sales WHERE "tenantId" = '{TID}'
  UNION ALL SELECT 'products', count(*)::int FROM products WHERE "tenantId" = '{TID}'
  UNION ALL SELECT 'product_variants', count(*)::int FROM product_variants pv
    JOIN products p ON p.id = pv."productId" WHERE p."tenantId" = '{TID}'
  UNION ALL SELECT 'customers', count(*)::int FROM customers WHERE "tenantId" = '{TID}'
  UNION ALL SELECT 'suppliers', count(*)::int FROM suppliers WHERE "tenantId" = '{TID}'
  UNION ALL SELECT 'inventory', count(*)::int FROM inventory WHERE "tenantId" = '{TID}'
  UNION ALL SELECT 'inventory_logs', count(*)::int FROM inventory_logs WHERE "tenantId" = '{TID}'
  UNION ALL SELECT 'inventory_reservations', count(*)::int FROM inventory_reservations WHERE "tenantId" = '{TID}'
  UNION ALL SELECT 'users', count(*)::int FROM users WHERE "tenantId" = '{TID}'
  UNION ALL SELECT 'branches', count(*)::int FROM branches WHERE "tenantId" = '{TID}'
) s ORDER BY t;
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)
sftp = ssh.open_sftp()
with sftp.file("/tmp/wipe_deen_pass3.sql", "w") as f:
    f.write(SQL)
sftp.close()

ssh.exec_command(f"docker cp /tmp/wipe_deen_pass3.sql {DB}:/tmp/wipe_deen_pass3.sql")[1].channel.recv_exit_status()

_, o, e = ssh.exec_command(
    f"docker exec {DB} psql -U fashionerp -d fashionerp "
    "-v ON_ERROR_STOP=1 -f /tmp/wipe_deen_pass3.sql",
    timeout=180,
)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
ssh.close()
