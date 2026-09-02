"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TABLE_STATUS_BADGE_CLASS,
  TABLE_VALUE_BADGE_CLASS,
  resolveTableStatus,
  resolveValueVariant,
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
    <Badge variant={resolved.variant} className={cn(TABLE_STATUS_BADGE_CLASS, "min-w-[3.75rem]", className)}>
      {resolved.label}
    </Badge>
  );
}

/** Solid table chip for categorical values (type, category, payment, etc.) */
export function TableValueBadge({
  label,
  variant,
  className,
  autoColor = true,
}: {
  label: string;
  variant?: TableStatusVariant;
  className?: string;
  /** When true (default), picks a semantic or hashed color from the label */
  autoColor?: boolean;
}) {
  const resolvedVariant = variant ?? (autoColor ? resolveValueVariant(label) : "secondary");

  return (
    <Badge variant={resolvedVariant} className={cn(TABLE_VALUE_BADGE_CLASS, className)}>
      {label}
    </Badge>
  );
}

export { TABLE_STATUS_BADGE_CLASS, TABLE_VALUE_BADGE_CLASS };
