"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TABLE_STATUS_BADGE_CLASS,
  resolveTableStatus,
  type TableStatusVariant,
} from "@/lib/table-status";

export function TableStatusBadge({
  status,
  label,
  variant,
  className,
}: {
  status: string;
  label?: string;
  variant?: TableStatusVariant;
  className?: string;
}) {
  const resolved = resolveTableStatus(status, { label, variant });

  return (
    <Badge variant={resolved.variant} className={cn(TABLE_STATUS_BADGE_CLASS, className)}>
      {resolved.label}
    </Badge>
  );
}

/** Solid table chip for categorical values (type, category, payment, etc.) */
export function TableValueBadge({
  label,
  variant = "secondary",
  className,
}: {
  label: string;
  variant?: TableStatusVariant;
  className?: string;
}) {
  return (
    <Badge variant={variant} className={cn(TABLE_STATUS_BADGE_CLASS, className)}>
      {label}
    </Badge>
  );
}

export { TABLE_STATUS_BADGE_CLASS };
