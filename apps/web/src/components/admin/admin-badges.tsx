"use client";

import { TableStatusBadge, TableValueBadge } from "@/components/ui/table-status-badge";
import { ADMIN_PLAN_VARIANT } from "@/lib/admin-ui";

export function AdminStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return <TableStatusBadge status={status} className={className} />;
}

export function AdminPlanBadge({
  plan,
  className,
}: {
  plan: string;
  className?: string;
}) {
  const key = String(plan ?? "").trim().toUpperCase();
  return (
    <TableValueBadge
      label={key || "—"}
      variant={ADMIN_PLAN_VARIANT[key]}
      autoColor={!ADMIN_PLAN_VARIANT[key]}
      className={className}
    />
  );
}
