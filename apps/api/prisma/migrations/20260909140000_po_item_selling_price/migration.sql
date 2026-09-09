-- Purchase order line: selling price (for multi-PO / POS price options)
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "sellingPrice" DOUBLE PRECISION;
