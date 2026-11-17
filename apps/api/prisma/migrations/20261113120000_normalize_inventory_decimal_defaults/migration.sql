-- Normalize legacy inventory decimal defaults so Prisma can read all stock rows.
UPDATE "inventory"
SET
  "damagedQtyDec" = CASE
    WHEN "damagedQtyDec" = 'NaN'::double precision THEN 0
    ELSE "damagedQtyDec"
  END,
  "returnedQtyDec" = CASE
    WHEN "returnedQtyDec" = 'NaN'::double precision THEN 0
    ELSE "returnedQtyDec"
  END
WHERE "damagedQtyDec" = 'NaN'::double precision
   OR "returnedQtyDec" = 'NaN'::double precision;

ALTER TABLE "inventory"
  ALTER COLUMN "damagedQtyDec" SET DEFAULT 0,
  ALTER COLUMN "returnedQtyDec" SET DEFAULT 0;
