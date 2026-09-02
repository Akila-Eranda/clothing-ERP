"use client";

import { TableStatusBadge } from "@/components/ui/table-status-badge";
import { resolveTableStatus, type TableStatusVariant } from "@/lib/table-status";

const PO_STATUS: Record<string, { label: string; variant: TableStatusVariant }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  PENDING_APPROVAL: { label: "Pending", variant: "info" },
  CONFIRMED: { label: "Ordered", variant: "info" },
  SENT: { label: "Ordered", variant: "info" },
  PARTIALLY_RECEIVED: { label: "Partial", variant: "gold" },
  RECEIVED: { label: "Received", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "danger" },
};

const GRN_SOURCE: Record<string, { label: string; variant: TableStatusVariant }> = {
  FROM_PO: { label: "From PO", variant: "info" },
  QUICK: { label: "Quick", variant: "gold" },
  DIRECT: { label: "Direct", variant: "teal" },
};

const GRN_STATUS: Record<string, { label: string; variant: TableStatusVariant }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  POSTED: { label: "Posted", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "danger" },
};

function mapStatusBadge(
  status: string,
  map: Record<string, { label: string; variant: TableStatusVariant }>,
) {
  const cfg = map[status];
  if (cfg) {
    return <TableStatusBadge status={status} label={cfg.label} variant={cfg.variant} />;
  }
  const resolved = resolveTableStatus(status);
  return <TableStatusBadge status={status} label={resolved.label} variant={resolved.variant} />;
}

export function POStatusBadge({ status }: { status: string }) {
  return mapStatusBadge(status, PO_STATUS);
}

export function GrnSourceBadge({ source }: { source: string }) {
  return mapStatusBadge(source, GRN_SOURCE);
}

export function GrnStatusBadge({ status }: { status: string }) {
  return mapStatusBadge(status, GRN_STATUS);
}

export { PO_STATUS, GRN_SOURCE, GRN_STATUS };
