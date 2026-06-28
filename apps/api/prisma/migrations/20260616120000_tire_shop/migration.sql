-- Add TIRE_SHOP business vertical and tyre metadata on products
ALTER TYPE "ShopType" ADD VALUE IF NOT EXISTS 'TIRE_SHOP';

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "loadIndex" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "speedRating" TEXT;
