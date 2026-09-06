-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "paymentDueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_orders_paymentDueDate_idx" ON "purchase_orders"("paymentDueDate");
