-- Supplier advance apply: remember a fingerprint of the request so the same clientRequestId with a different
-- payload can be refused (409) instead of silently replaying. Additive: one nullable column, no index, no rewrite.
ALTER TABLE "supplier_advance_entries" ADD COLUMN IF NOT EXISTS "requestFingerprint" TEXT;
