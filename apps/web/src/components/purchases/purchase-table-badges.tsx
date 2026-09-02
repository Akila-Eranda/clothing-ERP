"use client";

import {
  CheckCircle2, Clock, FileText, Package, Send, ShoppingBag,
  Truck, XCircle, Zap, PackageCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TABLE_BADGE =
  "h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap";

type BadgeVariant =
  | "success" | "secondary" | "danger" | "warning" | "info"
  | "purple" | "gold" | "teal";

const PO_STATUS: Record<string, { label: string; variant: BadgeVariant; icon: React.ElementType }> = {
  DRAFT: { label: "Draft", variant: "secondary", icon: FileText },
  PENDING_APPROVAL: { label: "Pending Approval", variant: "purple", icon: Clock },
  CONFIRMED: { label: "Ordered", variant: "info", icon: Truck },
  SENT: { label: "Ordered", variant: "info", icon: Send },
  PARTIALLY_RECEIVED: { label: "Partial", variant: "gold", icon: Package },
  RECEIVED: { label: "Received", variant: "success", icon: CheckCircle2 },
  CANCELLED: { label: "Cancelled", variant: "danger", icon: XCircle },
};

const GRN_SOURCE: Record<string, { label: string; variant: BadgeVariant; icon: React.ElementType }> = {
  FROM_PO: { label: "From PO", variant: "info", icon: ShoppingBag },
  QUICK: { label: "Quick", variant: "gold", icon: Zap },
  DIRECT: { label: "Direct", variant: "teal", icon: PackageCheck },
};

const GRN_STATUS: Record<string, { label: string; variant: BadgeVariant; icon: React.ElementType }> = {
  DRAFT: { label: "Draft", variant: "secondary", icon: FileText },
  POSTED: { label: "Posted", variant: "success", icon: CheckCircle2 },
  CANCELLED: { label: "Cancelled", variant: "danger", icon: XCircle },
};

function TableStatusBadge({
  config,
  fallbackLabel,
}: {
  config: { label: string; variant: BadgeVariant; icon: React.ElementType };
  fallbackLabel?: string;
}) {
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={TABLE_BADGE}>
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} />
      {fallbackLabel ?? config.label}
    </Badge>
  );
}

export function POStatusBadge({ status }: { status: string }) {
  const cfg = PO_STATUS[status] ?? {
    label: status.replace(/_/g, " "),
    variant: "secondary" as const,
    icon: FileText,
  };
  return <TableStatusBadge config={cfg} fallbackLabel={cfg.label} />;
}

export function GrnSourceBadge({ source }: { source: string }) {
  const cfg = GRN_SOURCE[source] ?? {
    label: source.replace(/_/g, " "),
    variant: "secondary" as const,
    icon: PackageCheck,
  };
  return <TableStatusBadge config={cfg} />;
}

export function GrnStatusBadge({ status }: { status: string }) {
  const cfg = GRN_STATUS[status] ?? {
    label: status.replace(/_/g, " "),
    variant: "secondary" as const,
    icon: FileText,
  };
  return <TableStatusBadge config={cfg} />;
}

export { PO_STATUS, GRN_SOURCE, GRN_STATUS, TABLE_BADGE };
