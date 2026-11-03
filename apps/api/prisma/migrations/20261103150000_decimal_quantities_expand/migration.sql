-- Decimal stock quantities — EXPAND step of an expand/contract migration (owner-approved Option 1, 3 Nov 2026).
--
-- Why not ALTER COLUMN ... TYPE DOUBLE PRECISION: a local test showed that the current production
-- code (Prisma client with Int fields) CORRUPTS a DOUBLE column when it writes (21 was stored as
-- 1.04e-322; increments were lost) and truncates decimals when it reads. Rolling back the app, or old
-- and new API instances overlapping during a deploy, would damage stock quantities.
--
-- This migration is additive and keeps both application versions safe:
--   * every existing INTEGER column stays exactly as it is (name, type, values) — old code is untouched;
--   * a new "<col>Dec" DOUBLE PRECISION column is added and backfilled from the integer value;
--   * a BEFORE INSERT/UPDATE trigger keeps each pair in sync:
--       - a write to <col>Dec (new code)  -> <col> = round(<col>Dec)  (errors if beyond INTEGER range);
--       - a write to <col> only (old code) -> <col>Dec = <col>;
--       - new columns default to 'NaN' so an INSERT that did not set <col>Dec is recognised as an old-code
--         insert and takes the integer value (a 0 default could not be told apart from a real 0);
--   * INTEGER columns that had no default get DEFAULT 0 (metadata only: no stored value changes; old code
--     always sends these columns explicitly) so new code can omit them.
-- The old columns and the triggers are removed only in a separately reviewed CONTRACT release, once no
-- old application version or script can run against the database.
-- Known behaviour, never silent: if old code changes the INTEGER of a row whose <col>Dec held a fraction,
-- the fraction is lost (old code only understands whole numbers). Every such event is written to
-- hx_qty_sync_log (table, row, column, previous decimal, previous and new integer) for review/correction.

CREATE TABLE IF NOT EXISTS "hx_qty_sync_log" (
  "id"          BIGSERIAL PRIMARY KEY,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tableName"   TEXT NOT NULL,
  "rowId"       TEXT NOT NULL,
  "columnName"  TEXT NOT NULL,
  "previousDec" DOUBLE PRECISION NOT NULL,
  "previousInt" INTEGER NOT NULL,
  "newInt"      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "hx_qty_sync_log_tableName_rowId_idx" ON "hx_qty_sync_log"("tableName", "rowId");

CREATE OR REPLACE FUNCTION hx_qty_to_int(v double precision) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF v = 'NaN'::double precision THEN RAISE EXCEPTION 'quantity is NaN'; END IF;
  RETURN round(v::numeric)::integer;   -- raises numeric_value_out_of_range beyond INTEGER: never wraps
END $$;

-- ── inventory: damagedQty, returnedQty
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "damagedQtyDec" DOUBLE PRECISION;
UPDATE "inventory" SET "damagedQtyDec" = "damagedQty"::double precision WHERE "damagedQtyDec" IS NULL;
ALTER TABLE "inventory" ALTER COLUMN "damagedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "inventory" ALTER COLUMN "damagedQtyDec" SET NOT NULL;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "returnedQtyDec" DOUBLE PRECISION;
UPDATE "inventory" SET "returnedQtyDec" = "returnedQty"::double precision WHERE "returnedQtyDec" IS NULL;
ALTER TABLE "inventory" ALTER COLUMN "returnedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "inventory" ALTER COLUMN "returnedQtyDec" SET NOT NULL;
CREATE OR REPLACE FUNCTION hx_sync_qty_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."damagedQtyDec" IS NULL OR NEW."damagedQtyDec" = 'NaN'::double precision THEN
      NEW."damagedQtyDec" := NEW."damagedQty"::double precision;          -- old-code insert
    ELSE
      NEW."damagedQty" := hx_qty_to_int(NEW."damagedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."damagedQtyDec" IS DISTINCT FROM OLD."damagedQtyDec" AND NEW."damagedQtyDec" <> 'NaN'::double precision THEN
      NEW."damagedQty" := hx_qty_to_int(NEW."damagedQtyDec");             -- new code changed the decimal
    ELSIF NEW."damagedQty" IS DISTINCT FROM OLD."damagedQty" THEN
      IF OLD."damagedQtyDec" <> OLD."damagedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'damagedQty', OLD."damagedQtyDec", OLD."damagedQty", NEW."damagedQty");
      END IF;
      NEW."damagedQtyDec" := NEW."damagedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."damagedQtyDec" = 'NaN'::double precision THEN
      NEW."damagedQtyDec" := NEW."damagedQty"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."returnedQtyDec" IS NULL OR NEW."returnedQtyDec" = 'NaN'::double precision THEN
      NEW."returnedQtyDec" := NEW."returnedQty"::double precision;          -- old-code insert
    ELSE
      NEW."returnedQty" := hx_qty_to_int(NEW."returnedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."returnedQtyDec" IS DISTINCT FROM OLD."returnedQtyDec" AND NEW."returnedQtyDec" <> 'NaN'::double precision THEN
      NEW."returnedQty" := hx_qty_to_int(NEW."returnedQtyDec");             -- new code changed the decimal
    ELSIF NEW."returnedQty" IS DISTINCT FROM OLD."returnedQty" THEN
      IF OLD."returnedQtyDec" <> OLD."returnedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'returnedQty', OLD."returnedQtyDec", OLD."returnedQty", NEW."returnedQty");
      END IF;
      NEW."returnedQtyDec" := NEW."returnedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."returnedQtyDec" = 'NaN'::double precision THEN
      NEW."returnedQtyDec" := NEW."returnedQty"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_inventory ON "inventory";
CREATE TRIGGER hx_sync_qty_inventory BEFORE INSERT OR UPDATE ON "inventory" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_inventory();

-- ── inventory_lots: quantity, reservedQty
ALTER TABLE "inventory_lots" ADD COLUMN IF NOT EXISTS "quantityDec" DOUBLE PRECISION;
UPDATE "inventory_lots" SET "quantityDec" = "quantity"::double precision WHERE "quantityDec" IS NULL;
ALTER TABLE "inventory_lots" ALTER COLUMN "quantityDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "inventory_lots" ALTER COLUMN "quantityDec" SET NOT NULL;
ALTER TABLE "inventory_lots" ADD COLUMN IF NOT EXISTS "reservedQtyDec" DOUBLE PRECISION;
UPDATE "inventory_lots" SET "reservedQtyDec" = "reservedQty"::double precision WHERE "reservedQtyDec" IS NULL;
ALTER TABLE "inventory_lots" ALTER COLUMN "reservedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "inventory_lots" ALTER COLUMN "reservedQtyDec" SET NOT NULL;
CREATE OR REPLACE FUNCTION hx_sync_qty_inventory_lots() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."quantityDec" IS NULL OR NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old-code insert
    ELSE
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."quantityDec" IS DISTINCT FROM OLD."quantityDec" AND NEW."quantityDec" <> 'NaN'::double precision THEN
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new code changed the decimal
    ELSIF NEW."quantity" IS DISTINCT FROM OLD."quantity" THEN
      IF OLD."quantityDec" <> OLD."quantity"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'quantity', OLD."quantityDec", OLD."quantity", NEW."quantity");
      END IF;
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old code changed the integer
    ELSIF NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."reservedQtyDec" IS NULL OR NEW."reservedQtyDec" = 'NaN'::double precision THEN
      NEW."reservedQtyDec" := NEW."reservedQty"::double precision;          -- old-code insert
    ELSE
      NEW."reservedQty" := hx_qty_to_int(NEW."reservedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."reservedQtyDec" IS DISTINCT FROM OLD."reservedQtyDec" AND NEW."reservedQtyDec" <> 'NaN'::double precision THEN
      NEW."reservedQty" := hx_qty_to_int(NEW."reservedQtyDec");             -- new code changed the decimal
    ELSIF NEW."reservedQty" IS DISTINCT FROM OLD."reservedQty" THEN
      IF OLD."reservedQtyDec" <> OLD."reservedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'reservedQty', OLD."reservedQtyDec", OLD."reservedQty", NEW."reservedQty");
      END IF;
      NEW."reservedQtyDec" := NEW."reservedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."reservedQtyDec" = 'NaN'::double precision THEN
      NEW."reservedQtyDec" := NEW."reservedQty"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_inventory_lots ON "inventory_lots";
CREATE TRIGGER hx_sync_qty_inventory_lots BEFORE INSERT OR UPDATE ON "inventory_lots" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_inventory_lots();

-- ── inventory_lot_reservations: quantity
ALTER TABLE "inventory_lot_reservations" ADD COLUMN IF NOT EXISTS "quantityDec" DOUBLE PRECISION;
UPDATE "inventory_lot_reservations" SET "quantityDec" = "quantity"::double precision WHERE "quantityDec" IS NULL;
ALTER TABLE "inventory_lot_reservations" ALTER COLUMN "quantityDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "inventory_lot_reservations" ALTER COLUMN "quantityDec" SET NOT NULL;
ALTER TABLE "inventory_lot_reservations" ALTER COLUMN "quantity" SET DEFAULT 0;
CREATE OR REPLACE FUNCTION hx_sync_qty_inventory_lot_reservations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."quantityDec" IS NULL OR NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old-code insert
    ELSE
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."quantityDec" IS DISTINCT FROM OLD."quantityDec" AND NEW."quantityDec" <> 'NaN'::double precision THEN
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new code changed the decimal
    ELSIF NEW."quantity" IS DISTINCT FROM OLD."quantity" THEN
      IF OLD."quantityDec" <> OLD."quantity"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'quantity', OLD."quantityDec", OLD."quantity", NEW."quantity");
      END IF;
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old code changed the integer
    ELSIF NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_inventory_lot_reservations ON "inventory_lot_reservations";
CREATE TRIGGER hx_sync_qty_inventory_lot_reservations BEFORE INSERT OR UPDATE ON "inventory_lot_reservations" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_inventory_lot_reservations();

-- ── inventory_reservations: quantity
ALTER TABLE "inventory_reservations" ADD COLUMN IF NOT EXISTS "quantityDec" DOUBLE PRECISION;
UPDATE "inventory_reservations" SET "quantityDec" = "quantity"::double precision WHERE "quantityDec" IS NULL;
ALTER TABLE "inventory_reservations" ALTER COLUMN "quantityDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "inventory_reservations" ALTER COLUMN "quantityDec" SET NOT NULL;
ALTER TABLE "inventory_reservations" ALTER COLUMN "quantity" SET DEFAULT 0;
CREATE OR REPLACE FUNCTION hx_sync_qty_inventory_reservations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."quantityDec" IS NULL OR NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old-code insert
    ELSE
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."quantityDec" IS DISTINCT FROM OLD."quantityDec" AND NEW."quantityDec" <> 'NaN'::double precision THEN
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new code changed the decimal
    ELSIF NEW."quantity" IS DISTINCT FROM OLD."quantity" THEN
      IF OLD."quantityDec" <> OLD."quantity"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'quantity', OLD."quantityDec", OLD."quantity", NEW."quantity");
      END IF;
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old code changed the integer
    ELSIF NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_inventory_reservations ON "inventory_reservations";
CREATE TRIGGER hx_sync_qty_inventory_reservations BEFORE INSERT OR UPDATE ON "inventory_reservations" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_inventory_reservations();

-- ── stock_count_lines: systemQty, countedQty
ALTER TABLE "stock_count_lines" ADD COLUMN IF NOT EXISTS "systemQtyDec" DOUBLE PRECISION;
UPDATE "stock_count_lines" SET "systemQtyDec" = "systemQty"::double precision WHERE "systemQtyDec" IS NULL;
ALTER TABLE "stock_count_lines" ALTER COLUMN "systemQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "stock_count_lines" ALTER COLUMN "systemQtyDec" SET NOT NULL;
ALTER TABLE "stock_count_lines" ALTER COLUMN "systemQty" SET DEFAULT 0;
ALTER TABLE "stock_count_lines" ADD COLUMN IF NOT EXISTS "countedQtyDec" DOUBLE PRECISION;
UPDATE "stock_count_lines" SET "countedQtyDec" = "countedQty"::double precision WHERE "countedQtyDec" IS NULL;
ALTER TABLE "stock_count_lines" ALTER COLUMN "countedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "stock_count_lines" ALTER COLUMN "countedQtyDec" SET NOT NULL;
ALTER TABLE "stock_count_lines" ALTER COLUMN "countedQty" SET DEFAULT 0;
CREATE OR REPLACE FUNCTION hx_sync_qty_stock_count_lines() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."systemQtyDec" IS NULL OR NEW."systemQtyDec" = 'NaN'::double precision THEN
      NEW."systemQtyDec" := NEW."systemQty"::double precision;          -- old-code insert
    ELSE
      NEW."systemQty" := hx_qty_to_int(NEW."systemQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."systemQtyDec" IS DISTINCT FROM OLD."systemQtyDec" AND NEW."systemQtyDec" <> 'NaN'::double precision THEN
      NEW."systemQty" := hx_qty_to_int(NEW."systemQtyDec");             -- new code changed the decimal
    ELSIF NEW."systemQty" IS DISTINCT FROM OLD."systemQty" THEN
      IF OLD."systemQtyDec" <> OLD."systemQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'systemQty', OLD."systemQtyDec", OLD."systemQty", NEW."systemQty");
      END IF;
      NEW."systemQtyDec" := NEW."systemQty"::double precision;          -- old code changed the integer
    ELSIF NEW."systemQtyDec" = 'NaN'::double precision THEN
      NEW."systemQtyDec" := NEW."systemQty"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."countedQtyDec" IS NULL OR NEW."countedQtyDec" = 'NaN'::double precision THEN
      NEW."countedQtyDec" := NEW."countedQty"::double precision;          -- old-code insert
    ELSE
      NEW."countedQty" := hx_qty_to_int(NEW."countedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."countedQtyDec" IS DISTINCT FROM OLD."countedQtyDec" AND NEW."countedQtyDec" <> 'NaN'::double precision THEN
      NEW."countedQty" := hx_qty_to_int(NEW."countedQtyDec");             -- new code changed the decimal
    ELSIF NEW."countedQty" IS DISTINCT FROM OLD."countedQty" THEN
      IF OLD."countedQtyDec" <> OLD."countedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'countedQty', OLD."countedQtyDec", OLD."countedQty", NEW."countedQty");
      END IF;
      NEW."countedQtyDec" := NEW."countedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."countedQtyDec" = 'NaN'::double precision THEN
      NEW."countedQtyDec" := NEW."countedQty"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_stock_count_lines ON "stock_count_lines";
CREATE TRIGGER hx_sync_qty_stock_count_lines BEFORE INSERT OR UPDATE ON "stock_count_lines" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_stock_count_lines();

-- ── stock_transfer_items: requestedQty, sentQty, receivedQty
ALTER TABLE "stock_transfer_items" ADD COLUMN IF NOT EXISTS "requestedQtyDec" DOUBLE PRECISION;
UPDATE "stock_transfer_items" SET "requestedQtyDec" = "requestedQty"::double precision WHERE "requestedQtyDec" IS NULL;
ALTER TABLE "stock_transfer_items" ALTER COLUMN "requestedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "stock_transfer_items" ALTER COLUMN "requestedQtyDec" SET NOT NULL;
ALTER TABLE "stock_transfer_items" ALTER COLUMN "requestedQty" SET DEFAULT 0;
ALTER TABLE "stock_transfer_items" ADD COLUMN IF NOT EXISTS "sentQtyDec" DOUBLE PRECISION;
UPDATE "stock_transfer_items" SET "sentQtyDec" = "sentQty"::double precision WHERE "sentQtyDec" IS NULL;
ALTER TABLE "stock_transfer_items" ALTER COLUMN "sentQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "stock_transfer_items" ALTER COLUMN "sentQtyDec" SET NOT NULL;
ALTER TABLE "stock_transfer_items" ADD COLUMN IF NOT EXISTS "receivedQtyDec" DOUBLE PRECISION;
UPDATE "stock_transfer_items" SET "receivedQtyDec" = "receivedQty"::double precision WHERE "receivedQtyDec" IS NULL;
ALTER TABLE "stock_transfer_items" ALTER COLUMN "receivedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "stock_transfer_items" ALTER COLUMN "receivedQtyDec" SET NOT NULL;
CREATE OR REPLACE FUNCTION hx_sync_qty_stock_transfer_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."requestedQtyDec" IS NULL OR NEW."requestedQtyDec" = 'NaN'::double precision THEN
      NEW."requestedQtyDec" := NEW."requestedQty"::double precision;          -- old-code insert
    ELSE
      NEW."requestedQty" := hx_qty_to_int(NEW."requestedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."requestedQtyDec" IS DISTINCT FROM OLD."requestedQtyDec" AND NEW."requestedQtyDec" <> 'NaN'::double precision THEN
      NEW."requestedQty" := hx_qty_to_int(NEW."requestedQtyDec");             -- new code changed the decimal
    ELSIF NEW."requestedQty" IS DISTINCT FROM OLD."requestedQty" THEN
      IF OLD."requestedQtyDec" <> OLD."requestedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'requestedQty', OLD."requestedQtyDec", OLD."requestedQty", NEW."requestedQty");
      END IF;
      NEW."requestedQtyDec" := NEW."requestedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."requestedQtyDec" = 'NaN'::double precision THEN
      NEW."requestedQtyDec" := NEW."requestedQty"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."sentQtyDec" IS NULL OR NEW."sentQtyDec" = 'NaN'::double precision THEN
      NEW."sentQtyDec" := NEW."sentQty"::double precision;          -- old-code insert
    ELSE
      NEW."sentQty" := hx_qty_to_int(NEW."sentQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."sentQtyDec" IS DISTINCT FROM OLD."sentQtyDec" AND NEW."sentQtyDec" <> 'NaN'::double precision THEN
      NEW."sentQty" := hx_qty_to_int(NEW."sentQtyDec");             -- new code changed the decimal
    ELSIF NEW."sentQty" IS DISTINCT FROM OLD."sentQty" THEN
      IF OLD."sentQtyDec" <> OLD."sentQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'sentQty', OLD."sentQtyDec", OLD."sentQty", NEW."sentQty");
      END IF;
      NEW."sentQtyDec" := NEW."sentQty"::double precision;          -- old code changed the integer
    ELSIF NEW."sentQtyDec" = 'NaN'::double precision THEN
      NEW."sentQtyDec" := NEW."sentQty"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."receivedQtyDec" IS NULL OR NEW."receivedQtyDec" = 'NaN'::double precision THEN
      NEW."receivedQtyDec" := NEW."receivedQty"::double precision;          -- old-code insert
    ELSE
      NEW."receivedQty" := hx_qty_to_int(NEW."receivedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."receivedQtyDec" IS DISTINCT FROM OLD."receivedQtyDec" AND NEW."receivedQtyDec" <> 'NaN'::double precision THEN
      NEW."receivedQty" := hx_qty_to_int(NEW."receivedQtyDec");             -- new code changed the decimal
    ELSIF NEW."receivedQty" IS DISTINCT FROM OLD."receivedQty" THEN
      IF OLD."receivedQtyDec" <> OLD."receivedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'receivedQty', OLD."receivedQtyDec", OLD."receivedQty", NEW."receivedQty");
      END IF;
      NEW."receivedQtyDec" := NEW."receivedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."receivedQtyDec" = 'NaN'::double precision THEN
      NEW."receivedQtyDec" := NEW."receivedQty"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_stock_transfer_items ON "stock_transfer_items";
CREATE TRIGGER hx_sync_qty_stock_transfer_items BEFORE INSERT OR UPDATE ON "stock_transfer_items" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_stock_transfer_items();

-- ── stock_transfer_lots: quantity
ALTER TABLE "stock_transfer_lots" ADD COLUMN IF NOT EXISTS "quantityDec" DOUBLE PRECISION;
UPDATE "stock_transfer_lots" SET "quantityDec" = "quantity"::double precision WHERE "quantityDec" IS NULL;
ALTER TABLE "stock_transfer_lots" ALTER COLUMN "quantityDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "stock_transfer_lots" ALTER COLUMN "quantityDec" SET NOT NULL;
ALTER TABLE "stock_transfer_lots" ALTER COLUMN "quantity" SET DEFAULT 0;
CREATE OR REPLACE FUNCTION hx_sync_qty_stock_transfer_lots() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."quantityDec" IS NULL OR NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old-code insert
    ELSE
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."quantityDec" IS DISTINCT FROM OLD."quantityDec" AND NEW."quantityDec" <> 'NaN'::double precision THEN
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new code changed the decimal
    ELSIF NEW."quantity" IS DISTINCT FROM OLD."quantity" THEN
      IF OLD."quantityDec" <> OLD."quantity"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'quantity', OLD."quantityDec", OLD."quantity", NEW."quantity");
      END IF;
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old code changed the integer
    ELSIF NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_stock_transfer_lots ON "stock_transfer_lots";
CREATE TRIGGER hx_sync_qty_stock_transfer_lots BEFORE INSERT OR UPDATE ON "stock_transfer_lots" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_stock_transfer_lots();

-- ── return_items: quantity
ALTER TABLE "return_items" ADD COLUMN IF NOT EXISTS "quantityDec" DOUBLE PRECISION;
UPDATE "return_items" SET "quantityDec" = "quantity"::double precision WHERE "quantityDec" IS NULL;
ALTER TABLE "return_items" ALTER COLUMN "quantityDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "return_items" ALTER COLUMN "quantityDec" SET NOT NULL;
ALTER TABLE "return_items" ALTER COLUMN "quantity" SET DEFAULT 0;
CREATE OR REPLACE FUNCTION hx_sync_qty_return_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."quantityDec" IS NULL OR NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old-code insert
    ELSE
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."quantityDec" IS DISTINCT FROM OLD."quantityDec" AND NEW."quantityDec" <> 'NaN'::double precision THEN
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new code changed the decimal
    ELSIF NEW."quantity" IS DISTINCT FROM OLD."quantity" THEN
      IF OLD."quantityDec" <> OLD."quantity"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'quantity', OLD."quantityDec", OLD."quantity", NEW."quantity");
      END IF;
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old code changed the integer
    ELSIF NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_return_items ON "return_items";
CREATE TRIGGER hx_sync_qty_return_items BEFORE INSERT OR UPDATE ON "return_items" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_return_items();

-- ── purchase_order_items: orderedQty, freeQty, receivedQty, rejectedQty
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "orderedQtyDec" DOUBLE PRECISION;
UPDATE "purchase_order_items" SET "orderedQtyDec" = "orderedQty"::double precision WHERE "orderedQtyDec" IS NULL;
ALTER TABLE "purchase_order_items" ALTER COLUMN "orderedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "purchase_order_items" ALTER COLUMN "orderedQtyDec" SET NOT NULL;
ALTER TABLE "purchase_order_items" ALTER COLUMN "orderedQty" SET DEFAULT 0;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "freeQtyDec" DOUBLE PRECISION;
UPDATE "purchase_order_items" SET "freeQtyDec" = "freeQty"::double precision WHERE "freeQtyDec" IS NULL;
ALTER TABLE "purchase_order_items" ALTER COLUMN "freeQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "purchase_order_items" ALTER COLUMN "freeQtyDec" SET NOT NULL;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "receivedQtyDec" DOUBLE PRECISION;
UPDATE "purchase_order_items" SET "receivedQtyDec" = "receivedQty"::double precision WHERE "receivedQtyDec" IS NULL;
ALTER TABLE "purchase_order_items" ALTER COLUMN "receivedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "purchase_order_items" ALTER COLUMN "receivedQtyDec" SET NOT NULL;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "rejectedQtyDec" DOUBLE PRECISION;
UPDATE "purchase_order_items" SET "rejectedQtyDec" = "rejectedQty"::double precision WHERE "rejectedQtyDec" IS NULL;
ALTER TABLE "purchase_order_items" ALTER COLUMN "rejectedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "purchase_order_items" ALTER COLUMN "rejectedQtyDec" SET NOT NULL;
CREATE OR REPLACE FUNCTION hx_sync_qty_purchase_order_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."orderedQtyDec" IS NULL OR NEW."orderedQtyDec" = 'NaN'::double precision THEN
      NEW."orderedQtyDec" := NEW."orderedQty"::double precision;          -- old-code insert
    ELSE
      NEW."orderedQty" := hx_qty_to_int(NEW."orderedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."orderedQtyDec" IS DISTINCT FROM OLD."orderedQtyDec" AND NEW."orderedQtyDec" <> 'NaN'::double precision THEN
      NEW."orderedQty" := hx_qty_to_int(NEW."orderedQtyDec");             -- new code changed the decimal
    ELSIF NEW."orderedQty" IS DISTINCT FROM OLD."orderedQty" THEN
      IF OLD."orderedQtyDec" <> OLD."orderedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'orderedQty', OLD."orderedQtyDec", OLD."orderedQty", NEW."orderedQty");
      END IF;
      NEW."orderedQtyDec" := NEW."orderedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."orderedQtyDec" = 'NaN'::double precision THEN
      NEW."orderedQtyDec" := NEW."orderedQty"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."freeQtyDec" IS NULL OR NEW."freeQtyDec" = 'NaN'::double precision THEN
      NEW."freeQtyDec" := NEW."freeQty"::double precision;          -- old-code insert
    ELSE
      NEW."freeQty" := hx_qty_to_int(NEW."freeQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."freeQtyDec" IS DISTINCT FROM OLD."freeQtyDec" AND NEW."freeQtyDec" <> 'NaN'::double precision THEN
      NEW."freeQty" := hx_qty_to_int(NEW."freeQtyDec");             -- new code changed the decimal
    ELSIF NEW."freeQty" IS DISTINCT FROM OLD."freeQty" THEN
      IF OLD."freeQtyDec" <> OLD."freeQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'freeQty', OLD."freeQtyDec", OLD."freeQty", NEW."freeQty");
      END IF;
      NEW."freeQtyDec" := NEW."freeQty"::double precision;          -- old code changed the integer
    ELSIF NEW."freeQtyDec" = 'NaN'::double precision THEN
      NEW."freeQtyDec" := NEW."freeQty"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."receivedQtyDec" IS NULL OR NEW."receivedQtyDec" = 'NaN'::double precision THEN
      NEW."receivedQtyDec" := NEW."receivedQty"::double precision;          -- old-code insert
    ELSE
      NEW."receivedQty" := hx_qty_to_int(NEW."receivedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."receivedQtyDec" IS DISTINCT FROM OLD."receivedQtyDec" AND NEW."receivedQtyDec" <> 'NaN'::double precision THEN
      NEW."receivedQty" := hx_qty_to_int(NEW."receivedQtyDec");             -- new code changed the decimal
    ELSIF NEW."receivedQty" IS DISTINCT FROM OLD."receivedQty" THEN
      IF OLD."receivedQtyDec" <> OLD."receivedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'receivedQty', OLD."receivedQtyDec", OLD."receivedQty", NEW."receivedQty");
      END IF;
      NEW."receivedQtyDec" := NEW."receivedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."receivedQtyDec" = 'NaN'::double precision THEN
      NEW."receivedQtyDec" := NEW."receivedQty"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."rejectedQtyDec" IS NULL OR NEW."rejectedQtyDec" = 'NaN'::double precision THEN
      NEW."rejectedQtyDec" := NEW."rejectedQty"::double precision;          -- old-code insert
    ELSE
      NEW."rejectedQty" := hx_qty_to_int(NEW."rejectedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."rejectedQtyDec" IS DISTINCT FROM OLD."rejectedQtyDec" AND NEW."rejectedQtyDec" <> 'NaN'::double precision THEN
      NEW."rejectedQty" := hx_qty_to_int(NEW."rejectedQtyDec");             -- new code changed the decimal
    ELSIF NEW."rejectedQty" IS DISTINCT FROM OLD."rejectedQty" THEN
      IF OLD."rejectedQtyDec" <> OLD."rejectedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'rejectedQty', OLD."rejectedQtyDec", OLD."rejectedQty", NEW."rejectedQty");
      END IF;
      NEW."rejectedQtyDec" := NEW."rejectedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."rejectedQtyDec" = 'NaN'::double precision THEN
      NEW."rejectedQtyDec" := NEW."rejectedQty"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_purchase_order_items ON "purchase_order_items";
CREATE TRIGGER hx_sync_qty_purchase_order_items BEFORE INSERT OR UPDATE ON "purchase_order_items" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_purchase_order_items();

-- ── purchase_request_items: requestedQty
ALTER TABLE "purchase_request_items" ADD COLUMN IF NOT EXISTS "requestedQtyDec" DOUBLE PRECISION;
UPDATE "purchase_request_items" SET "requestedQtyDec" = "requestedQty"::double precision WHERE "requestedQtyDec" IS NULL;
ALTER TABLE "purchase_request_items" ALTER COLUMN "requestedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "purchase_request_items" ALTER COLUMN "requestedQtyDec" SET NOT NULL;
ALTER TABLE "purchase_request_items" ALTER COLUMN "requestedQty" SET DEFAULT 0;
CREATE OR REPLACE FUNCTION hx_sync_qty_purchase_request_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."requestedQtyDec" IS NULL OR NEW."requestedQtyDec" = 'NaN'::double precision THEN
      NEW."requestedQtyDec" := NEW."requestedQty"::double precision;          -- old-code insert
    ELSE
      NEW."requestedQty" := hx_qty_to_int(NEW."requestedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."requestedQtyDec" IS DISTINCT FROM OLD."requestedQtyDec" AND NEW."requestedQtyDec" <> 'NaN'::double precision THEN
      NEW."requestedQty" := hx_qty_to_int(NEW."requestedQtyDec");             -- new code changed the decimal
    ELSIF NEW."requestedQty" IS DISTINCT FROM OLD."requestedQty" THEN
      IF OLD."requestedQtyDec" <> OLD."requestedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'requestedQty', OLD."requestedQtyDec", OLD."requestedQty", NEW."requestedQty");
      END IF;
      NEW."requestedQtyDec" := NEW."requestedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."requestedQtyDec" = 'NaN'::double precision THEN
      NEW."requestedQtyDec" := NEW."requestedQty"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_purchase_request_items ON "purchase_request_items";
CREATE TRIGGER hx_sync_qty_purchase_request_items BEFORE INSERT OR UPDATE ON "purchase_request_items" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_purchase_request_items();

-- ── goods_receipt_items: orderedQty, receivedQty, rejectedQty
ALTER TABLE "goods_receipt_items" ADD COLUMN IF NOT EXISTS "orderedQtyDec" DOUBLE PRECISION;
UPDATE "goods_receipt_items" SET "orderedQtyDec" = "orderedQty"::double precision WHERE "orderedQtyDec" IS NULL;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "orderedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "orderedQtyDec" SET NOT NULL;
ALTER TABLE "goods_receipt_items" ADD COLUMN IF NOT EXISTS "receivedQtyDec" DOUBLE PRECISION;
UPDATE "goods_receipt_items" SET "receivedQtyDec" = "receivedQty"::double precision WHERE "receivedQtyDec" IS NULL;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "receivedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "receivedQtyDec" SET NOT NULL;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "receivedQty" SET DEFAULT 0;
ALTER TABLE "goods_receipt_items" ADD COLUMN IF NOT EXISTS "rejectedQtyDec" DOUBLE PRECISION;
UPDATE "goods_receipt_items" SET "rejectedQtyDec" = "rejectedQty"::double precision WHERE "rejectedQtyDec" IS NULL;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "rejectedQtyDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "goods_receipt_items" ALTER COLUMN "rejectedQtyDec" SET NOT NULL;
CREATE OR REPLACE FUNCTION hx_sync_qty_goods_receipt_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."orderedQtyDec" IS NULL OR NEW."orderedQtyDec" = 'NaN'::double precision THEN
      NEW."orderedQtyDec" := NEW."orderedQty"::double precision;          -- old-code insert
    ELSE
      NEW."orderedQty" := hx_qty_to_int(NEW."orderedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."orderedQtyDec" IS DISTINCT FROM OLD."orderedQtyDec" AND NEW."orderedQtyDec" <> 'NaN'::double precision THEN
      NEW."orderedQty" := hx_qty_to_int(NEW."orderedQtyDec");             -- new code changed the decimal
    ELSIF NEW."orderedQty" IS DISTINCT FROM OLD."orderedQty" THEN
      IF OLD."orderedQtyDec" <> OLD."orderedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'orderedQty', OLD."orderedQtyDec", OLD."orderedQty", NEW."orderedQty");
      END IF;
      NEW."orderedQtyDec" := NEW."orderedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."orderedQtyDec" = 'NaN'::double precision THEN
      NEW."orderedQtyDec" := NEW."orderedQty"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."receivedQtyDec" IS NULL OR NEW."receivedQtyDec" = 'NaN'::double precision THEN
      NEW."receivedQtyDec" := NEW."receivedQty"::double precision;          -- old-code insert
    ELSE
      NEW."receivedQty" := hx_qty_to_int(NEW."receivedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."receivedQtyDec" IS DISTINCT FROM OLD."receivedQtyDec" AND NEW."receivedQtyDec" <> 'NaN'::double precision THEN
      NEW."receivedQty" := hx_qty_to_int(NEW."receivedQtyDec");             -- new code changed the decimal
    ELSIF NEW."receivedQty" IS DISTINCT FROM OLD."receivedQty" THEN
      IF OLD."receivedQtyDec" <> OLD."receivedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'receivedQty', OLD."receivedQtyDec", OLD."receivedQty", NEW."receivedQty");
      END IF;
      NEW."receivedQtyDec" := NEW."receivedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."receivedQtyDec" = 'NaN'::double precision THEN
      NEW."receivedQtyDec" := NEW."receivedQty"::double precision;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."rejectedQtyDec" IS NULL OR NEW."rejectedQtyDec" = 'NaN'::double precision THEN
      NEW."rejectedQtyDec" := NEW."rejectedQty"::double precision;          -- old-code insert
    ELSE
      NEW."rejectedQty" := hx_qty_to_int(NEW."rejectedQtyDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."rejectedQtyDec" IS DISTINCT FROM OLD."rejectedQtyDec" AND NEW."rejectedQtyDec" <> 'NaN'::double precision THEN
      NEW."rejectedQty" := hx_qty_to_int(NEW."rejectedQtyDec");             -- new code changed the decimal
    ELSIF NEW."rejectedQty" IS DISTINCT FROM OLD."rejectedQty" THEN
      IF OLD."rejectedQtyDec" <> OLD."rejectedQty"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'rejectedQty', OLD."rejectedQtyDec", OLD."rejectedQty", NEW."rejectedQty");
      END IF;
      NEW."rejectedQtyDec" := NEW."rejectedQty"::double precision;          -- old code changed the integer
    ELSIF NEW."rejectedQtyDec" = 'NaN'::double precision THEN
      NEW."rejectedQtyDec" := NEW."rejectedQty"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_goods_receipt_items ON "goods_receipt_items";
CREATE TRIGGER hx_sync_qty_goods_receipt_items BEFORE INSERT OR UPDATE ON "goods_receipt_items" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_goods_receipt_items();

-- ── supplier_return_items: quantity
ALTER TABLE "supplier_return_items" ADD COLUMN IF NOT EXISTS "quantityDec" DOUBLE PRECISION;
UPDATE "supplier_return_items" SET "quantityDec" = "quantity"::double precision WHERE "quantityDec" IS NULL;
ALTER TABLE "supplier_return_items" ALTER COLUMN "quantityDec" SET DEFAULT 'NaN'::double precision;
ALTER TABLE "supplier_return_items" ALTER COLUMN "quantityDec" SET NOT NULL;
ALTER TABLE "supplier_return_items" ALTER COLUMN "quantity" SET DEFAULT 0;
CREATE OR REPLACE FUNCTION hx_sync_qty_supplier_return_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."quantityDec" IS NULL OR NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old-code insert
    ELSE
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new-code insert
    END IF;
  ELSE
    IF NEW."quantityDec" IS DISTINCT FROM OLD."quantityDec" AND NEW."quantityDec" <> 'NaN'::double precision THEN
      NEW."quantity" := hx_qty_to_int(NEW."quantityDec");             -- new code changed the decimal
    ELSIF NEW."quantity" IS DISTINCT FROM OLD."quantity" THEN
      IF OLD."quantityDec" <> OLD."quantity"::double precision THEN   -- a fraction is about to be lost: record it
        INSERT INTO "hx_qty_sync_log" ("tableName","rowId","columnName","previousDec","previousInt","newInt")
        VALUES (TG_TABLE_NAME, NEW.id, 'quantity', OLD."quantityDec", OLD."quantity", NEW."quantity");
      END IF;
      NEW."quantityDec" := NEW."quantity"::double precision;          -- old code changed the integer
    ELSIF NEW."quantityDec" = 'NaN'::double precision THEN
      NEW."quantityDec" := NEW."quantity"::double precision;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hx_sync_qty_supplier_return_items ON "supplier_return_items";
CREATE TRIGGER hx_sync_qty_supplier_return_items BEFORE INSERT OR UPDATE ON "supplier_return_items" FOR EACH ROW EXECUTE FUNCTION hx_sync_qty_supplier_return_items();
