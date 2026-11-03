-- Weighed / loose goods (kg, L) move in fractional quantities. Sales already allowed decimals,
-- but lots, transfers, returns, counts, POs and GRNs were INTEGER, so 0.375 kg could not be
-- allocated from a lot, received on a GRN or returned. INTEGER -> DOUBLE PRECISION is lossless.

ALTER TABLE "inventory" ALTER COLUMN "damagedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "inventory" ALTER COLUMN "returnedQty" TYPE DOUBLE PRECISION;

ALTER TABLE "inventory_lots" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
ALTER TABLE "inventory_lots" ALTER COLUMN "reservedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "inventory_lot_reservations" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
ALTER TABLE "inventory_reservations" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

ALTER TABLE "stock_count_lines" ALTER COLUMN "systemQty" TYPE DOUBLE PRECISION;
ALTER TABLE "stock_count_lines" ALTER COLUMN "countedQty" TYPE DOUBLE PRECISION;

ALTER TABLE "stock_transfer_items" ALTER COLUMN "requestedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "stock_transfer_items" ALTER COLUMN "sentQty" TYPE DOUBLE PRECISION;
ALTER TABLE "stock_transfer_items" ALTER COLUMN "receivedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "stock_transfer_lots" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

ALTER TABLE "return_items" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

ALTER TABLE "purchase_order_items" ALTER COLUMN "orderedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "purchase_order_items" ALTER COLUMN "freeQty" TYPE DOUBLE PRECISION;
ALTER TABLE "purchase_order_items" ALTER COLUMN "receivedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "purchase_order_items" ALTER COLUMN "rejectedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "purchase_request_items" ALTER COLUMN "requestedQty" TYPE DOUBLE PRECISION;

ALTER TABLE "goods_receipt_items" ALTER COLUMN "orderedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "receivedQty" TYPE DOUBLE PRECISION;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "rejectedQty" TYPE DOUBLE PRECISION;

ALTER TABLE "supplier_return_items" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
