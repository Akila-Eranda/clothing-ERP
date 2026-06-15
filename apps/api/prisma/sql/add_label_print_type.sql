-- Add LABEL print type for barcode tag jobs (run once on production DB)
ALTER TYPE "ReceiptPrintType" ADD VALUE IF NOT EXISTS 'LABEL';
