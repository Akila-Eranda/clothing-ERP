-- Platform staff role: admin panel access without finance/billing
ALTER TYPE "RoleType" ADD VALUE IF NOT EXISTS 'PLATFORM_STAFF';
