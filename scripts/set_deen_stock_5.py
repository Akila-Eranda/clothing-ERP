#!/usr/bin/env python3
"""Set stock qty=5 for all SL Deen supermarket product variants."""
import paramiko

HOST, USER, PASS = "95.217.14.198", "root", "FrCnCXMdTgiu"
TID = "cmrbqxbfe000h5bfdh4ntxtva"
BRANCH = "cmrbqxbfu000j5bfddx767a4b"
WH = "cmru7icrx00474fig1beu2vwz"

SQL = f"""
BEGIN;

UPDATE inventory
SET quantity = 5, "updatedAt" = NOW()
WHERE "tenantId" = '{TID}';

INSERT INTO inventory (
  id, "tenantId", "branchId", "warehouseId", "variantId",
  quantity, "reservedQty", "damagedQty", "returnedQty",
  "avgCost", "lastCost", "minStockLevel", "maxStockLevel", "reorderPoint",
  "createdAt", "updatedAt"
)
SELECT
  'c' || substr(md5(random()::text || clock_timestamp()::text || pv.id), 1, 24),
  '{TID}',
  '{BRANCH}',
  '{WH}',
  pv.id,
  5, 0, 0, 0,
  0, 0, 0, 0, 5,
  NOW(), NOW()
FROM product_variants pv
JOIN products p ON p.id = pv."productId"
WHERE p."tenantId" = '{TID}'
  AND NOT EXISTS (
    SELECT 1 FROM inventory i
    WHERE i."warehouseId" = '{WH}' AND i."variantId" = pv.id
  );

COMMIT;

SELECT
  (SELECT count(*) FROM products WHERE "tenantId" = '{TID}') AS products,
  (SELECT count(*) FROM product_variants pv JOIN products p ON p.id = pv."productId" WHERE p."tenantId" = '{TID}') AS variants,
  (SELECT count(*) FROM inventory WHERE "tenantId" = '{TID}') AS inventory_rows,
  (SELECT count(*) FROM inventory WHERE "tenantId" = '{TID}' AND quantity = 5) AS qty_5,
  (SELECT coalesce(sum(quantity),0) FROM inventory WHERE "tenantId" = '{TID}') AS total_qty;
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)
sftp = ssh.open_sftp()
with sftp.file("/tmp/deen_set_stock5.sql", "w") as f:
    f.write(SQL)
sftp.close()
ssh.exec_command("docker cp /tmp/deen_set_stock5.sql fashionerp_db:/tmp/deen_set_stock5.sql")[1].channel.recv_exit_status()
_, o, e = ssh.exec_command(
    "docker exec fashionerp_db psql -U fashionerp -d fashionerp -v ON_ERROR_STOP=1 -f /tmp/deen_set_stock5.sql",
    timeout=180,
)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)
ssh.close()
