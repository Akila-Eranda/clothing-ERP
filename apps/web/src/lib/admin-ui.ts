import type { TableStatusVariant } from "@/lib/table-status";

/** Canonical tenant / subscription status vocabulary for admin. */
export const ADMIN_TENANT_STATUSES = [
  "ACTIVE",
  "TRIAL",
  "SUSPENDED",
  "CANCELLED",
  "INACTIVE",
] as const;

export type AdminTenantStatus = (typeof ADMIN_TENANT_STATUSES)[number];

export const ADMIN_PLAN_KEYS = [
  "STARTER",
  "PROFESSIONAL",
  "ENTERPRISE",
  "CUSTOM",
] as const;

export type AdminPlanKey = (typeof ADMIN_PLAN_KEYS)[number];

export const ADMIN_PLAN_VARIANT: Record<string, TableStatusVariant> = {
  STARTER: "secondary",
  PROFESSIONAL: "info",
  ENTERPRISE: "gold",
  CUSTOM: "purple",
};

export const ADMIN_CARD =
  "rounded-xl border border-border bg-card shadow-[0_2px_10px_rgba(15,23,42,0.04)]";

export const ADMIN_INPUT =
  "w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-muted-foreground";

export const ADMIN_SELECT =
  "px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20";

export const ADMIN_MODAL_PANEL =
  "bg-card rounded-2xl border border-border p-6 w-full shadow-xl";
