-- Phase 12 Notifications: extended alert types

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'REORDER'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'REORDER';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'EXPIRY_ALERT'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'EXPIRY_ALERT';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'SUPPLIER_DUE'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'SUPPLIER_DUE';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'CHEQUE_DUE'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'CHEQUE_DUE';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'GRN_PENDING'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'GRN_PENDING';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'PO_PENDING'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'PO_PENDING';
  END IF;
END $$;
