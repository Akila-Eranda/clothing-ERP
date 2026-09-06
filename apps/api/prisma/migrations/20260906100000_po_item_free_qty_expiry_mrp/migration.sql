-- Purchase order line: free qty, expiry, MRP (grocery / pharmacy receiving)
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "freeQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "mrp" DOUBLE PRECISION;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);
