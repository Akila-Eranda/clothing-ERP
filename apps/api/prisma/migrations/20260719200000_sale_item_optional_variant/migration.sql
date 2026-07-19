-- Allow POS bill-only / custom sale lines without a catalog product variant.
ALTER TABLE "sale_items" ALTER COLUMN "variantId" DROP NOT NULL;
