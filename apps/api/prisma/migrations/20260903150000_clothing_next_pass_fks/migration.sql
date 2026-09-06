-- Clothing next-pass: add FKs matching Prisma schema (idempotent).
-- Additive only — no data mutations.

DO $$ BEGIN
  ALTER TABLE "store_sections"
    ADD CONSTRAINT "store_sections_floorId_fkey"
    FOREIGN KEY ("floorId") REFERENCES "store_floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "store_racks"
    ADD CONSTRAINT "store_racks_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "store_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "store_shelves"
    ADD CONSTRAINT "store_shelves_rackId_fkey"
    FOREIGN KEY ("rackId") REFERENCES "store_racks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "variant_shelf_locations"
    ADD CONSTRAINT "variant_shelf_locations_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "variant_shelf_locations"
    ADD CONSTRAINT "variant_shelf_locations_shelfId_fkey"
    FOREIGN KEY ("shelfId") REFERENCES "store_shelves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_bundle_components"
    ADD CONSTRAINT "product_bundle_components_bundleProductId_fkey"
    FOREIGN KEY ("bundleProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_bundle_components"
    ADD CONSTRAINT "product_bundle_components_componentVariantId_fkey"
    FOREIGN KEY ("componentVariantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fitting_sessions"
    ADD CONSTRAINT "fitting_sessions_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "fitting_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fitting_session_items"
    ADD CONSTRAINT "fitting_session_items_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "fitting_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fitting_session_items"
    ADD CONSTRAINT "fitting_session_items_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
