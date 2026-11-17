-- HexaOne fresh-database baseline (F-33b). DO NOT RUN ON AN EXISTING DATABASE.
-- = schema.prisma at main d8326a8, i.e. the state after the 44 migrations listed in baseline-migrations.txt
-- (20260616120000_tire_shop .. 20260927160000_cashier_wallet_gl).
-- Generated: prisma migrate diff --from-empty --to-schema-datamodel <schema.prisma@d8326a8> --script
-- Applied only by apps/api/scripts/db-fresh-install.mjs, which refuses non-empty databases.

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('SUPER_ADMIN', 'PLATFORM_STAFF', 'TENANT_ADMIN', 'BRANCH_MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'HR_MANAGER', 'VIEWER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DRAFT', 'ARCHIVED', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('STANDARD', 'VARIANT', 'WEIGHTED', 'BUNDLE');

-- CreateEnum
CREATE TYPE "BarcodeMode" AS ENUM ('SHARED', 'UNIQUE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGE', 'OPENING_STOCK', 'STOCK_COUNT');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'QR', 'WALLET', 'CUSTOMER_CREDIT', 'LOYALTY_POINTS', 'MIXED', 'CHEQUE', 'GIFT_VOUCHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('INITIATED', 'APPROVED', 'REJECTED', 'COMPLETED', 'REFUND_PROCESSED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DEFECTIVE', 'WRONG_ITEM', 'WRONG_PART', 'SIZE_ISSUE', 'COLOR_ISSUE', 'CUSTOMER_CHANGED_MIND', 'DAMAGED', 'WARRANTY', 'EXPIRED', 'QUALITY_ISSUE', 'BATCH_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoodsReceiptSource" AS ENUM ('FROM_PO', 'DIRECT', 'QUICK');

-- CreateEnum
CREATE TYPE "SupplierReturnStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierLedgerEntryType" AS ENUM ('GRN', 'INVOICE', 'PAYMENT', 'RETURN', 'ADJUSTMENT', 'SYNC', 'DEBIT_NOTE');

-- CreateEnum
CREATE TYPE "SupplierDebitNoteStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'LOW_STOCK', 'NEW_SALE', 'PAYMENT_DUE', 'BIRTHDAY_REMINDER', 'SYSTEM_ALERT', 'CUSTOM_CAMPAIGN', 'DAILY_SUMMARY', 'REORDER', 'EXPIRY_ALERT', 'SUPPLIER_DUE', 'CHEQUE_DUE', 'GRN_PENDING', 'PO_PENDING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'ON_LEAVE', 'LATE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ShopType" AS ENUM ('CLOTHING', 'GROCERY', 'HARDWARE', 'AGRICULTURE', 'SPARE_PARTS', 'TIRE_SHOP', 'GENERAL', 'BAKERY');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REPLACED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TubeType" AS ENUM ('TUBE', 'TUBELESS');

-- CreateEnum
CREATE TYPE "JobCardStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceLineType" AS ENUM ('PART', 'LABOR', 'SERVICE');

-- CreateEnum
CREATE TYPE "TyreSerialStatus" AS ENUM ('IN_STOCK', 'SOLD', 'CLAIMED');

-- CreateEnum
CREATE TYPE "ServiceReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceReminderChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED', 'BUY_X_GET_Y', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "ReceiptPrintType" AS ENUM ('SALE', 'PRE_BILL', 'RETURN', 'TEST', 'PAYSLIP', 'LABEL', 'GRN');

-- CreateEnum
CREATE TYPE "ReceiptPrintStatus" AS ENUM ('SUCCESS', 'FAILED', 'BROWSER_FALLBACK', 'QUEUED');

-- CreateEnum
CREATE TYPE "CreditScheduleStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditScheduleLineStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "CreditReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GiftVoucherStatus" AS ENUM ('ACTIVE', 'PARTIALLY_USED', 'REDEEMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReloadSaleType" AS ENUM ('DIGITAL', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "ReloadCardStatus" AS ENUM ('AVAILABLE', 'SOLD', 'VOID');

-- CreateEnum
CREATE TYPE "TaxDirection" AS ENUM ('OUTPUT', 'INPUT', 'BOTH');

-- CreateEnum
CREATE TYPE "VatReturnStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PettyCashTxnType" AS ENUM ('OPENING', 'DISBURSEMENT', 'REPLENISHMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REIMBURSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReimbursementStatus" AS ENUM ('PAID', 'VOID');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'NONE');

-- CreateEnum
CREATE TYPE "FixedAssetStatus" AS ENUM ('ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "FixedAssetTxnType" AS ENUM ('ACQUISITION', 'DEPRECIATION', 'DISPOSAL', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CURRENT', 'SAVINGS', 'CASH_IN_HAND', 'PETTY_CASH');

-- CreateEnum
CREATE TYPE "BankTxnType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'INTEREST', 'ADJUSTMENT', 'CHEQUE_CLEAR');

-- CreateEnum
CREATE TYPE "BankTxnStatus" AS ENUM ('PENDING', 'CLEARED', 'VOID');

-- CreateEnum
CREATE TYPE "ChequeDirection" AS ENUM ('RECEIVED', 'ISSUED');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('RECEIVED', 'ISSUED', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BankReconciliationStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollComponentType" AS ENUM ('ALLOWANCE', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollEntryStatus" AS ENUM ('DRAFT', 'CALCULATED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NumberSeriesResetPolicy" AS ENUM ('NEVER', 'YEARLY', 'MONTHLY', 'DAILY');

-- CreateEnum
CREATE TYPE "AccountingOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'POSTED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('OPEN', 'CLOSED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING', 'SALE', 'EXPENSE', 'PAYMENT', 'REFUND', 'DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "CalendarTaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeatureSuggestionStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED');

-- CreateEnum
CREATE TYPE "FeatureSuggestionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FeatureSuggestionHistoryAction" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'RESPONSE_UPDATED', 'NOTE_UPDATED');

-- CreateEnum
CREATE TYPE "FittingSessionStatus" AS ENUM ('IN_FITTING', 'RESERVED', 'SOLD', 'RETURNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "logo" TEXT,
    "domain" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "country" TEXT NOT NULL DEFAULT 'IN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'STARTER',
    "shopType" "ShopType" NOT NULL DEFAULT 'CLOTHING',
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionId" TEXT,
    "billingEmail" TEXT,
    "maxBranches" INTEGER NOT NULL DEFAULT 1,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxProducts" INTEGER NOT NULL DEFAULT 500,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_print_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT,
    "printType" "ReceiptPrintType" NOT NULL,
    "invoiceNumber" TEXT,
    "status" "ReceiptPrintStatus" NOT NULL,
    "printMode" TEXT NOT NULL DEFAULT 'browser',
    "printServerUrl" TEXT,
    "printerName" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_print_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstNumber" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatar" TEXT,
    "gender" "Gender",
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "posPinHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "type" "RoleType" NOT NULL DEFAULT 'CUSTOM',
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "shortDesc" TEXT,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "hsn" TEXT,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mrp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wholesalePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "productKind" "ProductKind" NOT NULL DEFAULT 'STANDARD',
    "barcodeMode" "BarcodeMode" NOT NULL DEFAULT 'UNIQUE',
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "allowDecimalSelling" BOOLEAN NOT NULL DEFAULT false,
    "weightScaleReady" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "oemNumber" TEXT,
    "modelNumber" TEXT,
    "loadIndex" TEXT,
    "speedRating" TEXT,
    "tubeType" "TubeType",
    "pattern" TEXT,
    "warrantyMonths" INTEGER,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "aiTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "hasVariants" BOOLEAN NOT NULL DEFAULT true,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "material" TEXT,
    "style" TEXT,
    "dotCode" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mrp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "image" TEXT,
    "season" TEXT,
    "year" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_products" (
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("collectionId","productId")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "avgCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStockLevel" INTEGER NOT NULL DEFAULT 0,
    "maxStockLevel" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 5,
    "lastCountedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "quantityChange" DOUBLE PRECISION NOT NULL,
    "quantityBefore" DOUBLE PRECISION NOT NULL,
    "quantityAfter" DOUBLE PRECISION NOT NULL,
    "reservedBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "damagedBefore" INTEGER NOT NULL DEFAULT 0,
    "damagedAfter" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "lotId" TEXT,
    "correlationId" TEXT,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "notes" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "variantId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "manufactureDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lot_reservations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_lot_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "countedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,
    "variance" INTEGER NOT NULL,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "sentQty" INTEGER NOT NULL DEFAULT 0,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lots" (
    "id" TEXT NOT NULL,
    "transferItemId" TEXT NOT NULL,
    "fromLotId" TEXT,
    "toLotId" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "stock_transfer_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "anniversary" TIMESTAMP(3),
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "tier" "CustomerTier" NOT NULL DEFAULT 'BRONZE',
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "walletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 30,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "referralCode" TEXT,
    "referredBy" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isFleet" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastPurchaseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_brands" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "engineCapacity" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_compatibilities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleModelId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_compatibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_vehicles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleModelId" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "engineCapacity" TEXT,
    "registrationNo" TEXT,
    "vin" TEXT,
    "chassisNo" TEXT,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_claims" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "saleId" TEXT,
    "claimNumber" TEXT NOT NULL,
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'PENDING',
    "warrantyMonths" INTEGER NOT NULL DEFAULT 0,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "claimDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueDescription" TEXT NOT NULL,
    "resolution" TEXT,
    "replacementVariantId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT,
    "quoteNumber" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_service_catalog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "defaultPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_service_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT NOT NULL,
    "customerVehicleId" TEXT,
    "appointmentId" TEXT,
    "jobNumber" TEXT NOT NULL,
    "status" "JobCardStatus" NOT NULL DEFAULT 'OPEN',
    "technicianId" TEXT,
    "odometer" INTEGER,
    "complaintNotes" TEXT,
    "beforeNotes" TEXT,
    "afterNotes" TEXT,
    "technicianNotes" TEXT,
    "customerSignature" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saleId" TEXT,
    "quotationId" TEXT,
    "createdBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_card_lines" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "lineType" "ServiceLineType" NOT NULL DEFAULT 'SERVICE',
    "variantId" TEXT,
    "serviceCatalogId" TEXT,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "job_card_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT NOT NULL,
    "customerVehicleId" TEXT,
    "appointmentNumber" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "serviceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tyre_serials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "dotCode" TEXT,
    "branchId" TEXT,
    "status" "TyreSerialStatus" NOT NULL DEFAULT 'IN_STOCK',
    "jobCardId" TEXT,
    "saleId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tyre_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerVehicleId" TEXT,
    "appointmentId" TEXT,
    "jobCardId" TEXT,
    "reminderType" TEXT NOT NULL DEFAULT 'SERVICE_DUE',
    "channel" "ServiceReminderChannel" NOT NULL DEFAULT 'SMS',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ServiceReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_transactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "referenceId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "chargeTxnId" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 30,
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" "CreditScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_credit_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_schedule_lines" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CreditScheduleLineStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_credit_schedule_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "chargeTxnId" TEXT,
    "scheduleLineId" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "CreditReminderStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_credit_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "cashierId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roundOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loyaltyDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "changeDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "couponCode" TEXT,
    "couponDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "helperEmployeeId" TEXT,
    "helperName" TEXT,
    "helperCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isReturn" BOOLEAN NOT NULL DEFAULT false,
    "originalSaleId" TEXT,
    "terminalId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "variantId" TEXT,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountType" TEXT NOT NULL DEFAULT 'FIXED',
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_vouchers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "initialAmount" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "status" "GiftVoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedToName" TEXT,
    "issuedToCustomerId" TEXT,
    "issuedBySaleId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reload_operators" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "digitalCommissionPct" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "physicalCommissionPct" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "quickPayUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reload_operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reload_denominations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "faceValue" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reload_denominations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reload_card_stocks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "operatorId" TEXT NOT NULL,
    "denominationId" TEXT NOT NULL,
    "pinCode" TEXT NOT NULL,
    "pinMasked" TEXT NOT NULL,
    "purchaseCost" DOUBLE PRECISION,
    "status" "ReloadCardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "soldSaleId" TEXT,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reload_card_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reload_sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "type" "ReloadSaleType" NOT NULL,
    "operatorId" TEXT NOT NULL,
    "denominationId" TEXT,
    "cardStockId" TEXT,
    "msisdn" TEXT,
    "faceValue" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reload_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "bankAccountId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "held_bills" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashierId" TEXT,
    "customerId" TEXT,
    "label" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "held_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "originalSaleId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "reason" "ReturnReason" NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'INITIATED',
    "returnType" TEXT NOT NULL DEFAULT 'RETURN',
    "notes" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeData" JSONB,
    "restockItems" BOOLEAN NOT NULL DEFAULT true,
    "processedBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "minOrderAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDiscount" DOUBLE PRECISION,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "perCustomerLimit" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "applicableTo" TEXT NOT NULL DEFAULT 'ALL',
    "campaignKind" TEXT NOT NULL DEFAULT 'STANDARD',
    "couponCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_products" (
    "promotionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("promotionId","productId")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "gstNumber" TEXT,
    "panNumber" TEXT,
    "bankDetails" JSONB NOT NULL DEFAULT '{}',
    "creditDays" INTEGER NOT NULL DEFAULT 30,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_product_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplierProductCode" TEXT,
    "leadTimeDays" INTEGER,
    "lastBuyingPrice" DOUBLE PRECISION,
    "minOrderQty" DOUBLE PRECISION,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_product_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "entryType" "SupplierLedgerEntryType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "supplierId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "paymentDueDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "reference" TEXT,
    "paymentterms" TEXT,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "orderedQty" INTEGER NOT NULL,
    "freeQty" INTEGER NOT NULL DEFAULT 0,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "rejectedQty" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "sellingPrice" DOUBLE PRECISION,
    "mrp" DOUBLE PRECISION,
    "expiryDate" TIMESTAMP(3),
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "invoiceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "invoiceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "requestNumber" TEXT NOT NULL,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "convertedPoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "unitCostHint" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "source" "GoodsReceiptSource" NOT NULL DEFAULT 'FROM_PO',
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'POSTED',
    "purchaseId" TEXT,
    "supplierId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT,
    "notes" TEXT,
    "supplierInvoiceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "purchaseItemId" TEXT,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "orderedQty" INTEGER NOT NULL DEFAULT 0,
    "receivedQty" INTEGER NOT NULL,
    "rejectedQty" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "manufactureDate" TIMESTAMP(3),
    "lotId" TEXT,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "goodsReceiptId" TEXT,
    "status" "SupplierReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lotId" TEXT,
    "batchNumber" TEXT,
    "reason" TEXT,

    CONSTRAINT "supplier_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "purchaseId" TEXT,
    "goodsReceiptId" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_debit_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "appliedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SupplierDebitNoteStatus" NOT NULL DEFAULT 'POSTED',
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "invoiceId" TEXT,
    "purchaseId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "direction" "TaxDirection" NOT NULL DEFAULT 'BOTH',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isInclusive" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "outputGlAccountId" TEXT,
    "inputGlAccountId" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_returns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "VatReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "outputVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchasesNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchasesGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "filedAt" TIMESTAMP(3),
    "filedBy" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petty_cash_funds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "glAccountId" TEXT,
    "bankAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petty_cash_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "type" "PettyCashTxnType" NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "expenseGlAccountId" TEXT,
    "receiptRef" TEXT,
    "claimId" TEXT,
    "reimbursementId" TEXT,
    "journalEntryId" TEXT,
    "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petty_cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_claims" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fundId" TEXT,
    "branchId" TEXT,
    "claimantName" TEXT NOT NULL,
    "employeeId" TEXT,
    "claimDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "expenseGlAccountId" TEXT,
    "receiptRef" TEXT,
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "rejectionReason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "fundId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payFromBankAccountId" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "status" "ReimbursementStatus" NOT NULL DEFAULT 'PAID',
    "journalEntryId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reimbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 60,
    "residualValuePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "method" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "decliningRate" DOUBLE PRECISION,
    "assetGlAccountId" TEXT,
    "accumDepGlAccountId" TEXT,
    "depExpenseGlAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "categoryId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "residualValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 60,
    "method" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "decliningRate" DOUBLE PRECISION,
    "accumulatedDep" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bookValue" DOUBLE PRECISION NOT NULL,
    "location" TEXT,
    "serialNumber" TEXT,
    "vendorName" TEXT,
    "assetGlAccountId" TEXT,
    "accumDepGlAccountId" TEXT,
    "depExpenseGlAccountId" TEXT,
    "disposedAt" TIMESTAMP(3),
    "disposalProceeds" DOUBLE PRECISION,
    "disposalNotes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_depreciations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "accumAfter" DOUBLE PRECISION NOT NULL,
    "bookValueAfter" DOUBLE PRECISION NOT NULL,
    "journalEntryId" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "fixed_asset_depreciations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "FixedAssetTxnType" NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "fromBranchId" TEXT,
    "toBranchId" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_asset_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalanceDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closingNotes" TEXT,
    "retainedEarningsAccountId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "entryNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "isPosted" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "debitAccountId" TEXT,
    "creditAccountId" TEXT,
    "type" "JournalEntryType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "categoryId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BankAccountType" NOT NULL DEFAULT 'CURRENT',
    "bankName" TEXT,
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "glAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "type" "BankTxnType" NOT NULL,
    "status" "BankTxnStatus" NOT NULL DEFAULT 'CLEARED',
    "amount" DOUBLE PRECISION NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valueDate" TIMESTAMP(3),
    "reference" TEXT,
    "description" TEXT,
    "expenseId" TEXT,
    "chequeId" TEXT,
    "reconciliationId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheques" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "direction" "ChequeDirection" NOT NULL,
    "status" "ChequeStatus" NOT NULL,
    "chequeNumber" TEXT NOT NULL,
    "bankName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "partyType" TEXT,
    "partyId" TEXT,
    "partyName" TEXT,
    "bankAccountId" TEXT,
    "notes" TEXT,
    "clearedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "statementBalance" DOUBLE PRECISION NOT NULL,
    "systemBalance" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "BankReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_book_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "paymentMethod" "PaymentMethod",
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_book_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT,
    "code" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "address" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "joiningDate" TIMESTAMP(3) NOT NULL,
    "leavingDate" TIMESTAMP(3),
    "basicSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bankDetails" JSONB NOT NULL DEFAULT '{}',
    "epfNumber" TEXT,
    "etfNumber" TEXT,
    "nicNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "epfEmployeeRate" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "epfEmployerRate" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "etfEmployerRate" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "epfWageCap" DOUBLE PRECISION,
    "salaryExpenseGlId" TEXT,
    "epfExpenseGlId" TEXT,
    "etfExpenseGlId" TEXT,
    "epfPayableGlId" TEXT,
    "etfPayableGlId" TEXT,
    "bankGlId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_number_series" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "includeYear" BOOLEAN NOT NULL DEFAULT true,
    "includeMonth" BOOLEAN NOT NULL DEFAULT false,
    "padLength" INTEGER NOT NULL DEFAULT 5,
    "resetPolicy" "NumberSeriesResetPolicy" NOT NULL DEFAULT 'YEARLY',
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "lastResetKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_number_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requireJournalApproval" BOOLEAN NOT NULL DEFAULT true,
    "allowPostDraft" BOOLEAN NOT NULL DEFAULT false,
    "blockPostingClosedPeriod" BOOLEAN NOT NULL DEFAULT true,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "autoPostEnabled" BOOLEAN NOT NULL DEFAULT true,
    "repairVatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultCashAccountId" TEXT,
    "defaultArAccountId" TEXT,
    "defaultApAccountId" TEXT,
    "defaultSalesAccountId" TEXT,
    "defaultPurchaseAccountId" TEXT,
    "defaultRetainedEarningsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_mappings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_outbox_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "AccountingOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "journalEntryId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manager" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_budgets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_budget_lines" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_journals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "lastRunDate" TIMESTAMP(3),
    "autoPost" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT,
    "lines" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_components" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PayrollComponentType" NOT NULL,
    "isEpfApplicable" BOOLEAN NOT NULL DEFAULT true,
    "isPercent" BOOLEAN NOT NULL DEFAULT false,
    "defaultAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentOfBasic" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEpfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEpfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEtf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "type" "PayrollComponentType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "componentId" TEXT,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payslipNumber" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "basicSalary" DOUBLE PRECISION NOT NULL,
    "allowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "epfWage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "epfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "epfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "etfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netSalary" DOUBLE PRECISION NOT NULL,
    "status" "PayrollEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "journalEntryId" TEXT,
    "payslipNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "leaveType" TEXT NOT NULL DEFAULT 'CASUAL',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_departments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "headEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_designations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_holidays" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_types" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 14,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "weekOff" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_shifts" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employee_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipients" TEXT[],
    "data" JSONB NOT NULL DEFAULT '{}',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_uploads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'general',
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "generatedBy" TEXT,
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverRole" TEXT,
    "approverUserId" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_instances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "initiatedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_tasks" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "assigneeId" TEXT,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "actedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),

    CONSTRAINT "workflow_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_events" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_counters" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "counterId" TEXT,
    "cashierId" TEXT NOT NULL,
    "openingCash" DOUBLE PRECISION NOT NULL,
    "openingTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closingCash" DOUBLE PRECISION,
    "closingTime" TIMESTAMP(3),
    "expectedCash" DOUBLE PRECISION,
    "actualCash" DOUBLE PRECISION,
    "variance" DOUBLE PRECISION,
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'OPEN',
    "denominationCount" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "clearedById" TEXT,
    "clearedAmount" DOUBLE PRECISION,
    "clearedToAccountId" TEXT,
    "walletGl" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "color" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CalendarTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assigneeId" TEXT,
    "createdBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_meetings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "target" TEXT NOT NULL DEFAULT 'ALL',
    "targetTenants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "seenCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_dismissals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_releases" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "popupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "targetType" TEXT NOT NULL DEFAULT 'ALL',
    "targetPlans" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetTenants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetBranches" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "docUrl" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_release_items" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "module" TEXT,
    "featureName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "badge" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "docUrl" TEXT,

    CONSTRAINT "platform_release_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_release_reads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "tenant_release_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_suggestions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "FeatureSuggestionStatus" NOT NULL DEFAULT 'NEW',
    "priority" "FeatureSuggestionPriority" NOT NULL DEFAULT 'MEDIUM',
    "publicResponse" TEXT,
    "internalNote" TEXT,
    "respondedByEmail" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_suggestion_history" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "action" "FeatureSuggestionHistoryAction" NOT NULL,
    "oldStatus" "FeatureSuggestionStatus",
    "newStatus" "FeatureSuggestionStatus",
    "oldPriority" "FeatureSuggestionPriority",
    "newPriority" "FeatureSuggestionPriority",
    "publicResponse" TEXT,
    "performedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_suggestion_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'Admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_floors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_sections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_racks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_racks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_shelves" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "rackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_shelves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_shelf_locations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "shelfId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_shelf_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fashion_colors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "hex" TEXT NOT NULL DEFAULT '#111827',
    "swatchUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fashion_colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_bundle_components" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bundleProductId" TEXT NOT NULL,
    "componentVariantId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_bundle_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitting_rooms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fitting_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitting_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "staffUserId" TEXT,
    "status" "FittingSessionStatus" NOT NULL DEFAULT 'IN_FITTING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fitting_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitting_session_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitting_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");

-- CreateIndex
CREATE INDEX "receipt_print_logs_tenantId_createdAt_idx" ON "receipt_print_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "receipt_print_logs_invoiceNumber_idx" ON "receipt_print_logs"("invoiceNumber");

-- CreateIndex
CREATE INDEX "branches_tenantId_idx" ON "branches"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenantId_code_key" ON "branches"("tenantId", "code");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "password_resets_token_idx" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "categories_tenantId_idx" ON "categories"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenantId_slug_key" ON "categories"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "brands_tenantId_idx" ON "brands"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_tenantId_slug_key" ON "brands"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_tenantId_productKind_idx" ON "products"("tenantId", "productKind");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_sku_key" ON "products"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_barcode_idx" ON "product_variants"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_sku_key" ON "product_variants"("productId", "sku");

-- CreateIndex
CREATE INDEX "collections_tenantId_idx" ON "collections"("tenantId");

-- CreateIndex
CREATE INDEX "collections_tenantId_isActive_idx" ON "collections"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "warehouses_tenantId_branchId_idx" ON "warehouses"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenantId_code_key" ON "warehouses"("tenantId", "code");

-- CreateIndex
CREATE INDEX "inventory_tenantId_idx" ON "inventory"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_branchId_idx" ON "inventory"("branchId");

-- CreateIndex
CREATE INDEX "inventory_branchId_variantId_idx" ON "inventory"("branchId", "variantId");

-- CreateIndex
CREATE INDEX "inventory_variantId_idx" ON "inventory"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_warehouseId_variantId_key" ON "inventory"("warehouseId", "variantId");

-- CreateIndex
CREATE INDEX "inventory_logs_tenantId_idx" ON "inventory_logs"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_logs_branchId_idx" ON "inventory_logs"("branchId");

-- CreateIndex
CREATE INDEX "inventory_logs_variantId_idx" ON "inventory_logs"("variantId");

-- CreateIndex
CREATE INDEX "inventory_logs_createdAt_idx" ON "inventory_logs"("createdAt");

-- CreateIndex
CREATE INDEX "inventory_logs_referenceType_referenceId_idx" ON "inventory_logs"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "inventory_logs_correlationId_idx" ON "inventory_logs"("correlationId");

-- CreateIndex
CREATE INDEX "inventory_logs_lotId_idx" ON "inventory_logs"("lotId");

-- CreateIndex
CREATE INDEX "inventory_logs_tenantId_createdAt_idx" ON "inventory_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_lots_tenantId_branchId_variantId_idx" ON "inventory_lots"("tenantId", "branchId", "variantId");

-- CreateIndex
CREATE INDEX "inventory_lots_tenantId_warehouseId_variantId_idx" ON "inventory_lots"("tenantId", "warehouseId", "variantId");

-- CreateIndex
CREATE INDEX "inventory_lots_tenantId_expiryDate_idx" ON "inventory_lots"("tenantId", "expiryDate");

-- CreateIndex
CREATE INDEX "inventory_lots_tenantId_branchId_expiryDate_idx" ON "inventory_lots"("tenantId", "branchId", "expiryDate");

-- CreateIndex
CREATE INDEX "inventory_lots_batchNumber_idx" ON "inventory_lots"("batchNumber");

-- CreateIndex
CREATE INDEX "inventory_lots_variantId_idx" ON "inventory_lots"("variantId");

-- CreateIndex
CREATE INDEX "inventory_lot_reservations_lotId_status_idx" ON "inventory_lot_reservations"("lotId", "status");

-- CreateIndex
CREATE INDEX "inventory_lot_reservations_tenantId_sourceType_sourceId_idx" ON "inventory_lot_reservations"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "inventory_reservations_tenantId_branchId_variantId_status_idx" ON "inventory_reservations"("tenantId", "branchId", "variantId", "status");

-- CreateIndex
CREATE INDEX "inventory_reservations_sourceType_sourceId_idx" ON "inventory_reservations"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "stock_count_sessions_tenantId_branchId_status_idx" ON "stock_count_sessions"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "stock_count_lines_sessionId_idx" ON "stock_count_lines"("sessionId");

-- CreateIndex
CREATE INDEX "stock_transfers_tenantId_idx" ON "stock_transfers"("tenantId");

-- CreateIndex
CREATE INDEX "stock_transfers_fromWarehouseId_idx" ON "stock_transfers"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "stock_transfers_toWarehouseId_idx" ON "stock_transfers"("toWarehouseId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_transferId_idx" ON "stock_transfer_items"("transferId");

-- CreateIndex
CREATE INDEX "stock_transfer_lots_transferItemId_idx" ON "stock_transfer_lots"("transferItemId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_referralCode_key" ON "customers"("referralCode");

-- CreateIndex
CREATE INDEX "customers_tenantId_idx" ON "customers"("tenantId");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "customers_tenantId_creditBalance_idx" ON "customers"("tenantId", "creditBalance");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_phone_key" ON "customers"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "vehicle_brands_tenantId_idx" ON "vehicle_brands"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_brands_tenantId_name_key" ON "vehicle_brands"("tenantId", "name");

-- CreateIndex
CREATE INDEX "vehicle_models_tenantId_idx" ON "vehicle_models"("tenantId");

-- CreateIndex
CREATE INDEX "vehicle_models_brandId_idx" ON "vehicle_models"("brandId");

-- CreateIndex
CREATE INDEX "part_compatibilities_tenantId_idx" ON "part_compatibilities"("tenantId");

-- CreateIndex
CREATE INDEX "part_compatibilities_variantId_idx" ON "part_compatibilities"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "part_compatibilities_vehicleModelId_variantId_key" ON "part_compatibilities"("vehicleModelId", "variantId");

-- CreateIndex
CREATE INDEX "customer_vehicles_customerId_idx" ON "customer_vehicles"("customerId");

-- CreateIndex
CREATE INDEX "customer_vehicles_tenantId_idx" ON "customer_vehicles"("tenantId");

-- CreateIndex
CREATE INDEX "customer_vehicles_vin_idx" ON "customer_vehicles"("vin");

-- CreateIndex
CREATE INDEX "customer_vehicles_chassisNo_idx" ON "customer_vehicles"("chassisNo");

-- CreateIndex
CREATE INDEX "warranty_claims_tenantId_idx" ON "warranty_claims"("tenantId");

-- CreateIndex
CREATE INDEX "warranty_claims_customerId_idx" ON "warranty_claims"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_claims_tenantId_claimNumber_key" ON "warranty_claims"("tenantId", "claimNumber");

-- CreateIndex
CREATE INDEX "quotations_tenantId_idx" ON "quotations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenantId_quoteNumber_key" ON "quotations"("tenantId", "quoteNumber");

-- CreateIndex
CREATE INDEX "quotation_items_quotationId_idx" ON "quotation_items"("quotationId");

-- CreateIndex
CREATE INDEX "workshop_service_catalog_tenantId_idx" ON "workshop_service_catalog"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_service_catalog_tenantId_code_key" ON "workshop_service_catalog"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "job_cards_appointmentId_key" ON "job_cards"("appointmentId");

-- CreateIndex
CREATE INDEX "job_cards_tenantId_idx" ON "job_cards"("tenantId");

-- CreateIndex
CREATE INDEX "job_cards_customerId_idx" ON "job_cards"("customerId");

-- CreateIndex
CREATE INDEX "job_cards_status_idx" ON "job_cards"("status");

-- CreateIndex
CREATE UNIQUE INDEX "job_cards_tenantId_jobNumber_key" ON "job_cards"("tenantId", "jobNumber");

-- CreateIndex
CREATE INDEX "job_card_lines_jobCardId_idx" ON "job_card_lines"("jobCardId");

-- CreateIndex
CREATE INDEX "appointments_tenantId_idx" ON "appointments"("tenantId");

-- CreateIndex
CREATE INDEX "appointments_customerId_idx" ON "appointments"("customerId");

-- CreateIndex
CREATE INDEX "appointments_scheduledAt_idx" ON "appointments"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_tenantId_appointmentNumber_key" ON "appointments"("tenantId", "appointmentNumber");

-- CreateIndex
CREATE INDEX "tyre_serials_tenantId_idx" ON "tyre_serials"("tenantId");

-- CreateIndex
CREATE INDEX "tyre_serials_variantId_idx" ON "tyre_serials"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "tyre_serials_tenantId_serialNumber_key" ON "tyre_serials"("tenantId", "serialNumber");

-- CreateIndex
CREATE INDEX "service_reminders_tenantId_idx" ON "service_reminders"("tenantId");

-- CreateIndex
CREATE INDEX "service_reminders_customerId_idx" ON "service_reminders"("customerId");

-- CreateIndex
CREATE INDEX "service_reminders_scheduledFor_idx" ON "service_reminders"("scheduledFor");

-- CreateIndex
CREATE INDEX "service_reminders_status_idx" ON "service_reminders"("status");

-- CreateIndex
CREATE INDEX "loyalty_transactions_customerId_idx" ON "loyalty_transactions"("customerId");

-- CreateIndex
CREATE INDEX "wallet_transactions_customerId_idx" ON "wallet_transactions"("customerId");

-- CreateIndex
CREATE INDEX "customer_credit_transactions_customerId_idx" ON "customer_credit_transactions"("customerId");

-- CreateIndex
CREATE INDEX "customer_credit_transactions_tenantId_idx" ON "customer_credit_transactions"("tenantId");

-- CreateIndex
CREATE INDEX "customer_credit_transactions_tenantId_dueDate_idx" ON "customer_credit_transactions"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "customer_credit_transactions_tenantId_status_idx" ON "customer_credit_transactions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "customer_credit_schedules_tenantId_idx" ON "customer_credit_schedules"("tenantId");

-- CreateIndex
CREATE INDEX "customer_credit_schedules_customerId_idx" ON "customer_credit_schedules"("customerId");

-- CreateIndex
CREATE INDEX "customer_credit_schedule_lines_scheduleId_idx" ON "customer_credit_schedule_lines"("scheduleId");

-- CreateIndex
CREATE INDEX "customer_credit_schedule_lines_dueDate_idx" ON "customer_credit_schedule_lines"("dueDate");

-- CreateIndex
CREATE INDEX "customer_credit_reminders_tenantId_idx" ON "customer_credit_reminders"("tenantId");

-- CreateIndex
CREATE INDEX "customer_credit_reminders_customerId_idx" ON "customer_credit_reminders"("customerId");

-- CreateIndex
CREATE INDEX "customer_credit_reminders_tenantId_status_idx" ON "customer_credit_reminders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "sales_tenantId_idx" ON "sales"("tenantId");

-- CreateIndex
CREATE INDEX "sales_branchId_idx" ON "sales"("branchId");

-- CreateIndex
CREATE INDEX "sales_customerId_idx" ON "sales"("customerId");

-- CreateIndex
CREATE INDEX "sales_invoiceDate_idx" ON "sales"("invoiceDate");

-- CreateIndex
CREATE INDEX "sales_helperEmployeeId_idx" ON "sales"("helperEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenantId_invoiceNumber_key" ON "sales"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE INDEX "sale_items_variantId_idx" ON "sale_items"("variantId");

-- CreateIndex
CREATE INDEX "gift_vouchers_tenantId_idx" ON "gift_vouchers"("tenantId");

-- CreateIndex
CREATE INDEX "gift_vouchers_tenantId_status_idx" ON "gift_vouchers"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gift_vouchers_tenantId_code_key" ON "gift_vouchers"("tenantId", "code");

-- CreateIndex
CREATE INDEX "reload_operators_tenantId_isActive_idx" ON "reload_operators"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "reload_operators_tenantId_code_key" ON "reload_operators"("tenantId", "code");

-- CreateIndex
CREATE INDEX "reload_denominations_tenantId_idx" ON "reload_denominations"("tenantId");

-- CreateIndex
CREATE INDEX "reload_denominations_operatorId_isActive_idx" ON "reload_denominations"("operatorId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "reload_denominations_operatorId_faceValue_key" ON "reload_denominations"("operatorId", "faceValue");

-- CreateIndex
CREATE INDEX "reload_card_stocks_tenantId_status_idx" ON "reload_card_stocks"("tenantId", "status");

-- CreateIndex
CREATE INDEX "reload_card_stocks_operatorId_denominationId_status_idx" ON "reload_card_stocks"("operatorId", "denominationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reload_card_stocks_tenantId_pinCode_key" ON "reload_card_stocks"("tenantId", "pinCode");

-- CreateIndex
CREATE INDEX "reload_sales_tenantId_createdAt_idx" ON "reload_sales"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "reload_sales_saleId_idx" ON "reload_sales"("saleId");

-- CreateIndex
CREATE INDEX "reload_sales_operatorId_idx" ON "reload_sales"("operatorId");

-- CreateIndex
CREATE INDEX "sale_payments_saleId_idx" ON "sale_payments"("saleId");

-- CreateIndex
CREATE INDEX "sale_payments_bankAccountId_idx" ON "sale_payments"("bankAccountId");

-- CreateIndex
CREATE INDEX "held_bills_tenantId_branchId_idx" ON "held_bills"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "returns_tenantId_idx" ON "returns"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "returns_tenantId_returnNumber_key" ON "returns"("tenantId", "returnNumber");

-- CreateIndex
CREATE INDEX "return_items_returnId_idx" ON "return_items"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_couponCode_key" ON "promotions"("couponCode");

-- CreateIndex
CREATE INDEX "promotions_tenantId_idx" ON "promotions"("tenantId");

-- CreateIndex
CREATE INDEX "promotions_couponCode_idx" ON "promotions"("couponCode");

-- CreateIndex
CREATE INDEX "promotions_tenantId_campaignKind_idx" ON "promotions"("tenantId", "campaignKind");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_idx" ON "suppliers"("tenantId");

-- CreateIndex
CREATE INDEX "supplier_product_assignments_tenantId_supplierId_idx" ON "supplier_product_assignments"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "supplier_product_assignments_tenantId_variantId_idx" ON "supplier_product_assignments"("tenantId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_assignments_supplierId_variantId_key" ON "supplier_product_assignments"("supplierId", "variantId");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_tenantId_supplierId_createdAt_idx" ON "supplier_ledger_entries"("tenantId", "supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_referenceType_referenceId_idx" ON "supplier_ledger_entries"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_idx" ON "purchase_orders"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_orders_paymentDueDate_idx" ON "purchase_orders"("paymentDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenantId_poNumber_key" ON "purchase_orders"("tenantId", "poNumber");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchaseId_idx" ON "purchase_order_items"("purchaseId");

-- CreateIndex
CREATE INDEX "supplier_payments_supplierId_idx" ON "supplier_payments"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_payments_invoiceId_idx" ON "supplier_payments"("invoiceId");

-- CreateIndex
CREATE INDEX "supplier_payments_tenantId_paidAt_idx" ON "supplier_payments"("tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_paymentId_idx" ON "supplier_payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_purchaseId_idx" ON "supplier_payment_allocations"("purchaseId");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_invoiceId_idx" ON "supplier_payment_allocations"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_convertedPoId_key" ON "purchase_requests"("convertedPoId");

-- CreateIndex
CREATE INDEX "purchase_requests_tenantId_idx" ON "purchase_requests"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_requests_tenantId_status_idx" ON "purchase_requests"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_tenantId_requestNumber_key" ON "purchase_requests"("tenantId", "requestNumber");

-- CreateIndex
CREATE INDEX "purchase_request_items_requestId_idx" ON "purchase_request_items"("requestId");

-- CreateIndex
CREATE INDEX "goods_receipts_tenantId_idx" ON "goods_receipts"("tenantId");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseId_idx" ON "goods_receipts"("purchaseId");

-- CreateIndex
CREATE INDEX "goods_receipts_supplierId_idx" ON "goods_receipts"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenantId_grnNumber_key" ON "goods_receipts"("tenantId", "grnNumber");

-- CreateIndex
CREATE INDEX "goods_receipt_items_grnId_idx" ON "goods_receipt_items"("grnId");

-- CreateIndex
CREATE INDEX "goods_receipt_items_variantId_idx" ON "goods_receipt_items"("variantId");

-- CreateIndex
CREATE INDEX "supplier_returns_tenantId_idx" ON "supplier_returns"("tenantId");

-- CreateIndex
CREATE INDEX "supplier_returns_supplierId_idx" ON "supplier_returns"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_tenantId_returnNumber_key" ON "supplier_returns"("tenantId", "returnNumber");

-- CreateIndex
CREATE INDEX "supplier_return_items_returnId_idx" ON "supplier_return_items"("returnId");

-- CreateIndex
CREATE INDEX "supplier_invoices_tenantId_idx" ON "supplier_invoices"("tenantId");

-- CreateIndex
CREATE INDEX "supplier_invoices_supplierId_idx" ON "supplier_invoices"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_invoices_dueDate_idx" ON "supplier_invoices"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_tenantId_supplierId_invoiceNumber_key" ON "supplier_invoices"("tenantId", "supplierId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "supplier_debit_notes_tenantId_supplierId_idx" ON "supplier_debit_notes"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "supplier_debit_notes_supplierId_idx" ON "supplier_debit_notes"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_debit_notes_tenantId_noteNumber_key" ON "supplier_debit_notes"("tenantId", "noteNumber");

-- CreateIndex
CREATE INDEX "tax_rates_tenantId_idx" ON "tax_rates"("tenantId");

-- CreateIndex
CREATE INDEX "tax_rates_tenantId_isActive_idx" ON "tax_rates"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_tenantId_code_key" ON "tax_rates"("tenantId", "code");

-- CreateIndex
CREATE INDEX "vat_returns_tenantId_idx" ON "vat_returns"("tenantId");

-- CreateIndex
CREATE INDEX "vat_returns_tenantId_periodStart_periodEnd_idx" ON "vat_returns"("tenantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "vat_returns_tenantId_status_idx" ON "vat_returns"("tenantId", "status");

-- CreateIndex
CREATE INDEX "petty_cash_funds_tenantId_idx" ON "petty_cash_funds"("tenantId");

-- CreateIndex
CREATE INDEX "petty_cash_funds_tenantId_isActive_idx" ON "petty_cash_funds"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "petty_cash_funds_tenantId_code_key" ON "petty_cash_funds"("tenantId", "code");

-- CreateIndex
CREATE INDEX "petty_cash_transactions_tenantId_fundId_idx" ON "petty_cash_transactions"("tenantId", "fundId");

-- CreateIndex
CREATE INDEX "petty_cash_transactions_tenantId_txnDate_idx" ON "petty_cash_transactions"("tenantId", "txnDate");

-- CreateIndex
CREATE INDEX "petty_cash_transactions_fundId_txnDate_idx" ON "petty_cash_transactions"("fundId", "txnDate");

-- CreateIndex
CREATE INDEX "expense_claims_tenantId_idx" ON "expense_claims"("tenantId");

-- CreateIndex
CREATE INDEX "expense_claims_tenantId_status_idx" ON "expense_claims"("tenantId", "status");

-- CreateIndex
CREATE INDEX "expense_claims_tenantId_claimDate_idx" ON "expense_claims"("tenantId", "claimDate");

-- CreateIndex
CREATE UNIQUE INDEX "reimbursements_claimId_key" ON "reimbursements"("claimId");

-- CreateIndex
CREATE INDEX "reimbursements_tenantId_idx" ON "reimbursements"("tenantId");

-- CreateIndex
CREATE INDEX "reimbursements_tenantId_payDate_idx" ON "reimbursements"("tenantId", "payDate");

-- CreateIndex
CREATE INDEX "fixed_asset_categories_tenantId_idx" ON "fixed_asset_categories"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_categories_tenantId_code_key" ON "fixed_asset_categories"("tenantId", "code");

-- CreateIndex
CREATE INDEX "fixed_assets_tenantId_idx" ON "fixed_assets"("tenantId");

-- CreateIndex
CREATE INDEX "fixed_assets_tenantId_status_idx" ON "fixed_assets"("tenantId", "status");

-- CreateIndex
CREATE INDEX "fixed_assets_tenantId_branchId_idx" ON "fixed_assets"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_tenantId_code_key" ON "fixed_assets"("tenantId", "code");

-- CreateIndex
CREATE INDEX "fixed_asset_depreciations_tenantId_periodStart_idx" ON "fixed_asset_depreciations"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "fixed_asset_depreciations_assetId_idx" ON "fixed_asset_depreciations"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_depreciations_assetId_periodLabel_key" ON "fixed_asset_depreciations"("assetId", "periodLabel");

-- CreateIndex
CREATE INDEX "fixed_asset_transactions_tenantId_assetId_idx" ON "fixed_asset_transactions"("tenantId", "assetId");

-- CreateIndex
CREATE INDEX "fixed_asset_transactions_tenantId_txnDate_idx" ON "fixed_asset_transactions"("tenantId", "txnDate");

-- CreateIndex
CREATE INDEX "accounts_tenantId_idx" ON "accounts"("tenantId");

-- CreateIndex
CREATE INDEX "accounts_tenantId_type_idx" ON "accounts"("tenantId", "type");

-- CreateIndex
CREATE INDEX "accounts_tenantId_parentId_idx" ON "accounts"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenantId_code_key" ON "accounts"("tenantId", "code");

-- CreateIndex
CREATE INDEX "fiscal_years_tenantId_status_idx" ON "fiscal_years"("tenantId", "status");

-- CreateIndex
CREATE INDEX "fiscal_years_tenantId_isCurrent_idx" ON "fiscal_years"("tenantId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_tenantId_name_key" ON "fiscal_years"("tenantId", "name");

-- CreateIndex
CREATE INDEX "accounting_periods_tenantId_status_idx" ON "accounting_periods"("tenantId", "status");

-- CreateIndex
CREATE INDEX "accounting_periods_tenantId_startDate_endDate_idx" ON "accounting_periods"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_fiscalYearId_sequence_key" ON "accounting_periods"("fiscalYearId", "sequence");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_idx" ON "journal_entries"("tenantId");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_status_idx" ON "journal_entries"("tenantId", "status");

-- CreateIndex
CREATE INDEX "journal_entries_tenantId_date_idx" ON "journal_entries"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_entryNumber_key" ON "journal_entries"("tenantId", "entryNumber");

-- CreateIndex
CREATE INDEX "journal_lines_journalEntryId_idx" ON "journal_lines"("journalEntryId");

-- CreateIndex
CREATE INDEX "expenses_tenantId_idx" ON "expenses"("tenantId");

-- CreateIndex
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- CreateIndex
CREATE INDEX "bank_accounts_tenantId_idx" ON "bank_accounts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_tenantId_code_key" ON "bank_accounts"("tenantId", "code");

-- CreateIndex
CREATE INDEX "bank_transactions_tenantId_bankAccountId_idx" ON "bank_transactions"("tenantId", "bankAccountId");

-- CreateIndex
CREATE INDEX "bank_transactions_txnDate_idx" ON "bank_transactions"("txnDate");

-- CreateIndex
CREATE INDEX "cheques_tenantId_idx" ON "cheques"("tenantId");

-- CreateIndex
CREATE INDEX "cheques_tenantId_status_idx" ON "cheques"("tenantId", "status");

-- CreateIndex
CREATE INDEX "cheques_dueDate_idx" ON "cheques"("dueDate");

-- CreateIndex
CREATE INDEX "bank_reconciliations_tenantId_idx" ON "bank_reconciliations"("tenantId");

-- CreateIndex
CREATE INDEX "bank_reconciliations_bankAccountId_idx" ON "bank_reconciliations"("bankAccountId");

-- CreateIndex
CREATE INDEX "cash_book_entries_tenantId_entryDate_idx" ON "cash_book_entries"("tenantId", "entryDate");

-- CreateIndex
CREATE INDEX "cash_book_entries_tenantId_branchId_idx" ON "cash_book_entries"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "employees_tenantId_idx" ON "employees"("tenantId");

-- CreateIndex
CREATE INDEX "attendances_employeeId_idx" ON "attendances"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_employeeId_date_key" ON "attendances"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_settings_tenantId_key" ON "payroll_settings"("tenantId");

-- CreateIndex
CREATE INDEX "document_number_series_tenantId_idx" ON "document_number_series"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "document_number_series_tenantId_key_key" ON "document_number_series"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_preferences_tenantId_key" ON "accounting_preferences"("tenantId");

-- CreateIndex
CREATE INDEX "account_mappings_tenantId_idx" ON "account_mappings"("tenantId");

-- CreateIndex
CREATE INDEX "account_mappings_accountId_idx" ON "account_mappings"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "account_mappings_tenantId_key_key" ON "account_mappings"("tenantId", "key");

-- CreateIndex
CREATE INDEX "accounting_outbox_events_tenantId_status_idx" ON "accounting_outbox_events"("tenantId", "status");

-- CreateIndex
CREATE INDEX "accounting_outbox_events_tenantId_createdAt_idx" ON "accounting_outbox_events"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_outbox_events_tenantId_sourceType_sourceId_key" ON "accounting_outbox_events"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "cost_centers_tenantId_isActive_idx" ON "cost_centers"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_tenantId_code_key" ON "cost_centers"("tenantId", "code");

-- CreateIndex
CREATE INDEX "accounting_budgets_tenantId_fiscalYear_status_idx" ON "accounting_budgets"("tenantId", "fiscalYear", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_budgets_tenantId_name_fiscalYear_key" ON "accounting_budgets"("tenantId", "name", "fiscalYear");

-- CreateIndex
CREATE INDEX "accounting_budget_lines_budgetId_month_idx" ON "accounting_budget_lines"("budgetId", "month");

-- CreateIndex
CREATE INDEX "accounting_budget_lines_accountId_idx" ON "accounting_budget_lines"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_budget_lines_budgetId_accountId_costCenterId_mon_key" ON "accounting_budget_lines"("budgetId", "accountId", "costCenterId", "month");

-- CreateIndex
CREATE INDEX "recurring_journals_tenantId_isActive_nextRunDate_idx" ON "recurring_journals"("tenantId", "isActive", "nextRunDate");

-- CreateIndex
CREATE INDEX "exchange_rates_tenantId_effectiveAt_idx" ON "exchange_rates"("tenantId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_tenantId_fromCurrency_toCurrency_effectiveAt_key" ON "exchange_rates"("tenantId", "fromCurrency", "toCurrency", "effectiveAt");

-- CreateIndex
CREATE INDEX "payroll_components_tenantId_idx" ON "payroll_components"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_components_tenantId_code_key" ON "payroll_components"("tenantId", "code");

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_idx" ON "payroll_runs"("tenantId");

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_status_idx" ON "payroll_runs"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenantId_month_year_key" ON "payroll_runs"("tenantId", "month", "year");

-- CreateIndex
CREATE INDEX "payroll_lines_payrollId_idx" ON "payroll_lines"("payrollId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrollId_key" ON "payslips"("payrollId");

-- CreateIndex
CREATE INDEX "payslips_tenantId_idx" ON "payslips"("tenantId");

-- CreateIndex
CREATE INDEX "payslips_tenantId_periodLabel_idx" ON "payslips"("tenantId", "periodLabel");

-- CreateIndex
CREATE INDEX "payslips_employeeId_idx" ON "payslips"("employeeId");

-- CreateIndex
CREATE INDEX "payrolls_employeeId_idx" ON "payrolls"("employeeId");

-- CreateIndex
CREATE INDEX "payrolls_tenantId_month_year_idx" ON "payrolls"("tenantId", "month", "year");

-- CreateIndex
CREATE INDEX "payrolls_payrollRunId_idx" ON "payrolls"("payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_employeeId_month_year_key" ON "payrolls"("employeeId", "month", "year");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_idx" ON "leave_requests"("employeeId");

-- CreateIndex
CREATE INDEX "hr_departments_tenantId_idx" ON "hr_departments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_departments_tenantId_name_key" ON "hr_departments"("tenantId", "name");

-- CreateIndex
CREATE INDEX "hr_designations_tenantId_idx" ON "hr_designations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_designations_tenantId_name_key" ON "hr_designations"("tenantId", "name");

-- CreateIndex
CREATE INDEX "hr_holidays_tenantId_startDate_idx" ON "hr_holidays"("tenantId", "startDate");

-- CreateIndex
CREATE INDEX "hr_leave_types_tenantId_idx" ON "hr_leave_types"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "hr_leave_types_tenantId_name_key" ON "hr_leave_types"("tenantId", "name");

-- CreateIndex
CREATE INDEX "shifts_tenantId_idx" ON "shifts"("tenantId");

-- CreateIndex
CREATE INDEX "employee_shifts_employeeId_idx" ON "employee_shifts"("employeeId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_isRead_createdAt_idx" ON "notifications"("tenantId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_tenantId_createdAt_idx" ON "notifications"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "user_notifications_userId_idx" ON "user_notifications"("userId");

-- CreateIndex
CREATE INDEX "user_notifications_userId_isRead_idx" ON "user_notifications"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "user_notifications_userId_notificationId_key" ON "user_notifications"("userId", "notificationId");

-- CreateIndex
CREATE INDEX "file_uploads_tenantId_idx" ON "file_uploads"("tenantId");

-- CreateIndex
CREATE INDEX "reports_tenantId_idx" ON "reports"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_action_idx" ON "audit_logs"("tenantId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_resource_idx" ON "audit_logs"("tenantId", "resource");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_userId_idx" ON "activity_logs"("userId");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_tenantId_key_version_key" ON "workflow_definitions"("tenantId", "key", "version");

-- CreateIndex
CREATE INDEX "workflow_steps_definitionId_idx" ON "workflow_steps"("definitionId");

-- CreateIndex
CREATE INDEX "workflow_instances_tenantId_status_idx" ON "workflow_instances"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_instances_tenantId_entityType_entityId_key" ON "workflow_instances"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "workflow_tasks_instanceId_status_idx" ON "workflow_tasks"("instanceId", "status");

-- CreateIndex
CREATE INDEX "workflow_tasks_assigneeId_status_idx" ON "workflow_tasks"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "workflow_events_instanceId_createdAt_idx" ON "workflow_events"("instanceId", "createdAt");

-- CreateIndex
CREATE INDEX "pos_counters_tenantId_branchId_idx" ON "pos_counters"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_counters_tenantId_branchId_code_key" ON "pos_counters"("tenantId", "branchId", "code");

-- CreateIndex
CREATE INDEX "cash_registers_tenantId_branchId_status_idx" ON "cash_registers"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "cash_registers_tenantId_counterId_status_idx" ON "cash_registers"("tenantId", "counterId", "status");

-- CreateIndex
CREATE INDEX "cash_registers_tenantId_cashierId_status_idx" ON "cash_registers"("tenantId", "cashierId", "status");

-- CreateIndex
CREATE INDEX "cash_registers_tenantId_clearedAt_idx" ON "cash_registers"("tenantId", "clearedAt");

-- CreateIndex
CREATE INDEX "cash_registers_openingTime_idx" ON "cash_registers"("openingTime");

-- CreateIndex
CREATE INDEX "cash_movements_registerId_createdAt_idx" ON "cash_movements"("registerId", "createdAt");

-- CreateIndex
CREATE INDEX "cash_movements_tenantId_type_idx" ON "cash_movements"("tenantId", "type");

-- CreateIndex
CREATE INDEX "calendar_notes_tenantId_date_idx" ON "calendar_notes"("tenantId", "date");

-- CreateIndex
CREATE INDEX "calendar_tasks_tenantId_date_idx" ON "calendar_tasks"("tenantId", "date");

-- CreateIndex
CREATE INDEX "calendar_tasks_tenantId_status_idx" ON "calendar_tasks"("tenantId", "status");

-- CreateIndex
CREATE INDEX "calendar_meetings_tenantId_startsAt_idx" ON "calendar_meetings"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "platform_announcements_status_createdAt_idx" ON "platform_announcements"("status", "createdAt");

-- CreateIndex
CREATE INDEX "announcement_dismissals_userId_idx" ON "announcement_dismissals"("userId");

-- CreateIndex
CREATE INDEX "announcement_dismissals_announcementId_idx" ON "announcement_dismissals"("announcementId");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_dismissals_userId_announcementId_key" ON "announcement_dismissals"("userId", "announcementId");

-- CreateIndex
CREATE INDEX "platform_releases_status_releaseDate_idx" ON "platform_releases"("status", "releaseDate");

-- CreateIndex
CREATE INDEX "platform_releases_version_idx" ON "platform_releases"("version");

-- CreateIndex
CREATE INDEX "platform_release_items_releaseId_displayOrder_idx" ON "platform_release_items"("releaseId", "displayOrder");

-- CreateIndex
CREATE INDEX "tenant_release_reads_tenantId_idx" ON "tenant_release_reads"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_release_reads_releaseId_idx" ON "tenant_release_reads"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_release_reads_tenantId_releaseId_key" ON "tenant_release_reads"("tenantId", "releaseId");

-- CreateIndex
CREATE INDEX "feature_suggestions_tenantId_idx" ON "feature_suggestions"("tenantId");

-- CreateIndex
CREATE INDEX "feature_suggestions_submittedById_idx" ON "feature_suggestions"("submittedById");

-- CreateIndex
CREATE INDEX "feature_suggestions_status_idx" ON "feature_suggestions"("status");

-- CreateIndex
CREATE INDEX "feature_suggestions_priority_idx" ON "feature_suggestions"("priority");

-- CreateIndex
CREATE INDEX "feature_suggestions_category_idx" ON "feature_suggestions"("category");

-- CreateIndex
CREATE INDEX "feature_suggestions_createdAt_idx" ON "feature_suggestions"("createdAt");

-- CreateIndex
CREATE INDEX "feature_suggestion_history_suggestionId_createdAt_idx" ON "feature_suggestion_history"("suggestionId", "createdAt");

-- CreateIndex
CREATE INDEX "support_notes_tenantId_idx" ON "support_notes"("tenantId");

-- CreateIndex
CREATE INDEX "support_notes_createdAt_idx" ON "support_notes"("createdAt");

-- CreateIndex
CREATE INDEX "store_floors_tenantId_branchId_idx" ON "store_floors"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "store_floors_tenantId_branchId_code_key" ON "store_floors"("tenantId", "branchId", "code");

-- CreateIndex
CREATE INDEX "store_sections_floorId_idx" ON "store_sections"("floorId");

-- CreateIndex
CREATE INDEX "store_sections_tenantId_branchId_idx" ON "store_sections"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "store_sections_tenantId_branchId_code_key" ON "store_sections"("tenantId", "branchId", "code");

-- CreateIndex
CREATE INDEX "store_racks_sectionId_idx" ON "store_racks"("sectionId");

-- CreateIndex
CREATE INDEX "store_racks_tenantId_branchId_idx" ON "store_racks"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "store_racks_tenantId_branchId_code_key" ON "store_racks"("tenantId", "branchId", "code");

-- CreateIndex
CREATE INDEX "store_shelves_rackId_idx" ON "store_shelves"("rackId");

-- CreateIndex
CREATE INDEX "store_shelves_tenantId_branchId_idx" ON "store_shelves"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "store_shelves_tenantId_branchId_code_key" ON "store_shelves"("tenantId", "branchId", "code");

-- CreateIndex
CREATE INDEX "variant_shelf_locations_shelfId_idx" ON "variant_shelf_locations"("shelfId");

-- CreateIndex
CREATE INDEX "variant_shelf_locations_variantId_idx" ON "variant_shelf_locations"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "variant_shelf_locations_tenantId_branchId_variantId_key" ON "variant_shelf_locations"("tenantId", "branchId", "variantId");

-- CreateIndex
CREATE INDEX "fashion_colors_tenantId_isActive_idx" ON "fashion_colors"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "fashion_colors_tenantId_name_key" ON "fashion_colors"("tenantId", "name");

-- CreateIndex
CREATE INDEX "product_bundle_components_tenantId_idx" ON "product_bundle_components"("tenantId");

-- CreateIndex
CREATE INDEX "product_bundle_components_componentVariantId_idx" ON "product_bundle_components"("componentVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_bundle_components_bundleProductId_componentVariantI_key" ON "product_bundle_components"("bundleProductId", "componentVariantId");

-- CreateIndex
CREATE INDEX "fitting_rooms_tenantId_branchId_idx" ON "fitting_rooms"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "fitting_rooms_tenantId_branchId_code_key" ON "fitting_rooms"("tenantId", "branchId", "code");

-- CreateIndex
CREATE INDEX "fitting_sessions_tenantId_branchId_status_idx" ON "fitting_sessions"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "fitting_sessions_roomId_idx" ON "fitting_sessions"("roomId");

-- CreateIndex
CREATE INDEX "fitting_session_items_sessionId_idx" ON "fitting_session_items"("sessionId");

-- CreateIndex
CREATE INDEX "fitting_session_items_variantId_idx" ON "fitting_session_items"("variantId");

-- AddForeignKey
ALTER TABLE "receipt_print_logs" ADD CONSTRAINT "receipt_print_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_print_logs" ADD CONSTRAINT "receipt_print_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lot_reservations" ADD CONSTRAINT "inventory_lot_reservations_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "stock_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lots" ADD CONSTRAINT "stock_transfer_lots_transferItemId_fkey" FOREIGN KEY ("transferItemId") REFERENCES "stock_transfer_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_brands" ADD CONSTRAINT "vehicle_brands_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "vehicle_brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_compatibilities" ADD CONSTRAINT "part_compatibilities_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_compatibilities" ADD CONSTRAINT "part_compatibilities_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_service_catalog" ADD CONSTRAINT "workshop_service_catalog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_customerVehicleId_fkey" FOREIGN KEY ("customerVehicleId") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_card_lines" ADD CONSTRAINT "job_card_lines_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_card_lines" ADD CONSTRAINT "job_card_lines_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_card_lines" ADD CONSTRAINT "job_card_lines_serviceCatalogId_fkey" FOREIGN KEY ("serviceCatalogId") REFERENCES "workshop_service_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customerVehicleId_fkey" FOREIGN KEY ("customerVehicleId") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tyre_serials" ADD CONSTRAINT "tyre_serials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tyre_serials" ADD CONSTRAINT "tyre_serials_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reminders" ADD CONSTRAINT "service_reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reminders" ADD CONSTRAINT "service_reminders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_transactions" ADD CONSTRAINT "customer_credit_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_schedules" ADD CONSTRAINT "customer_credit_schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_schedules" ADD CONSTRAINT "customer_credit_schedules_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_schedules" ADD CONSTRAINT "customer_credit_schedules_chargeTxnId_fkey" FOREIGN KEY ("chargeTxnId") REFERENCES "customer_credit_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_schedule_lines" ADD CONSTRAINT "customer_credit_schedule_lines_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "customer_credit_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_reminders" ADD CONSTRAINT "customer_credit_reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_reminders" ADD CONSTRAINT "customer_credit_reminders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_helperEmployeeId_fkey" FOREIGN KEY ("helperEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_vouchers" ADD CONSTRAINT "gift_vouchers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_operators" ADD CONSTRAINT "reload_operators_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_denominations" ADD CONSTRAINT "reload_denominations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_denominations" ADD CONSTRAINT "reload_denominations_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "reload_operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_card_stocks" ADD CONSTRAINT "reload_card_stocks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_card_stocks" ADD CONSTRAINT "reload_card_stocks_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "reload_operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_card_stocks" ADD CONSTRAINT "reload_card_stocks_denominationId_fkey" FOREIGN KEY ("denominationId") REFERENCES "reload_denominations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_sales" ADD CONSTRAINT "reload_sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_sales" ADD CONSTRAINT "reload_sales_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "reload_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_sales" ADD CONSTRAINT "reload_sales_denominationId_fkey" FOREIGN KEY ("denominationId") REFERENCES "reload_denominations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reload_sales" ADD CONSTRAINT "reload_sales_cardStockId_fkey" FOREIGN KEY ("cardStockId") REFERENCES "reload_card_stocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_originalSaleId_fkey" FOREIGN KEY ("originalSaleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_assignments" ADD CONSTRAINT "supplier_product_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_assignments" ADD CONSTRAINT "supplier_product_assignments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_assignments" ADD CONSTRAINT "supplier_product_assignments_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_convertedPoId_fkey" FOREIGN KEY ("convertedPoId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "supplier_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_debit_notes" ADD CONSTRAINT "supplier_debit_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_debit_notes" ADD CONSTRAINT "supplier_debit_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_debit_notes" ADD CONSTRAINT "supplier_debit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_returns" ADD CONSTRAINT "vat_returns_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_funds" ADD CONSTRAINT "petty_cash_funds_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "petty_cash_funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "petty_cash_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "expense_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "petty_cash_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_categories" ADD CONSTRAINT "fixed_asset_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "fixed_asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_depreciations" ADD CONSTRAINT "fixed_asset_depreciations_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset_transactions" ADD CONSTRAINT "fixed_asset_transactions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "bank_reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_book_entries" ADD CONSTRAINT "cash_book_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_number_series" ADD CONSTRAINT "document_number_series_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_preferences" ADD CONSTRAINT "accounting_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_outbox_events" ADD CONSTRAINT "accounting_outbox_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_budgets" ADD CONSTRAINT "accounting_budgets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_budget_lines" ADD CONSTRAINT "accounting_budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "accounting_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_budget_lines" ADD CONSTRAINT "accounting_budget_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_budget_lines" ADD CONSTRAINT "accounting_budget_lines_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_journals" ADD CONSTRAINT "recurring_journals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_components" ADD CONSTRAINT "payroll_components_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_designations" ADD CONSTRAINT "hr_designations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_shifts" ADD CONSTRAINT "employee_shifts_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_counters" ADD CONSTRAINT "pos_counters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_counters" ADD CONSTRAINT "pos_counters_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "pos_counters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "cash_registers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_notes" ADD CONSTRAINT "calendar_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_tasks" ADD CONSTRAINT "calendar_tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_meetings" ADD CONSTRAINT "calendar_meetings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "platform_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_release_items" ADD CONSTRAINT "platform_release_items_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "platform_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_release_reads" ADD CONSTRAINT "tenant_release_reads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_release_reads" ADD CONSTRAINT "tenant_release_reads_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "platform_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_suggestions" ADD CONSTRAINT "feature_suggestions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_suggestions" ADD CONSTRAINT "feature_suggestions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_suggestion_history" ADD CONSTRAINT "feature_suggestion_history_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "feature_suggestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_sections" ADD CONSTRAINT "store_sections_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "store_floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_racks" ADD CONSTRAINT "store_racks_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "store_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_shelves" ADD CONSTRAINT "store_shelves_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "store_racks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_shelf_locations" ADD CONSTRAINT "variant_shelf_locations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_shelf_locations" ADD CONSTRAINT "variant_shelf_locations_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "store_shelves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundle_components" ADD CONSTRAINT "product_bundle_components_bundleProductId_fkey" FOREIGN KEY ("bundleProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundle_components" ADD CONSTRAINT "product_bundle_components_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitting_sessions" ADD CONSTRAINT "fitting_sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "fitting_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitting_session_items" ADD CONSTRAINT "fitting_session_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "fitting_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitting_session_items" ADD CONSTRAINT "fitting_session_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
