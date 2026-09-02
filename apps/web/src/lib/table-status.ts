export const TABLE_STATUS_BADGE_CLASS =
  "inline-flex min-w-[5.5rem] items-center justify-center rounded px-3 py-1 text-xs font-semibold capitalize whitespace-nowrap border-0 shadow-none";

export type TableStatusVariant =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "secondary"
  | "purple"
  | "gold"
  | "teal"
  | "default";

export function normalizeStatusKey(status: string): string {
  return String(status ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function formatStatusLabel(status: string): string {
  return normalizeStatusKey(status)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_MAP: Record<string, { variant: TableStatusVariant; label?: string }> = {
  RECEIVED: { variant: "success", label: "Received" },
  POSTED: { variant: "success", label: "Posted" },
  COMPLETED: { variant: "success", label: "Completed" },
  ACTIVE: { variant: "success", label: "Active" },
  PAID: { variant: "success", label: "Paid" },
  APPROVED: { variant: "success", label: "Approved" },
  OPEN: { variant: "success", label: "Open" },
  REFUND_PROCESSED: { variant: "success", label: "Refunded" },
  CLEAR: { variant: "success", label: "Clear" },
  IN_STOCK: { variant: "success", label: "In Stock" },
  OUT_OF_STOCK: { variant: "danger", label: "Out Of Stock" },
  LOW_STOCK: { variant: "warning", label: "Low Stock" },
  NEGATIVE: { variant: "danger", label: "Negative" },
  IN_TRANSIT: { variant: "info", label: "In Transit" },

  PENDING: { variant: "info", label: "Pending" },
  PENDING_APPROVAL: { variant: "info", label: "Pending" },
  INITIATED: { variant: "info", label: "Pending" },
  CONFIRMED: { variant: "info", label: "Ordered" },
  SENT: { variant: "info", label: "Ordered" },
  ORDERED: { variant: "info", label: "Ordered" },
  IN_PROGRESS: { variant: "info", label: "In Progress" },

  PARTIALLY_RECEIVED: { variant: "gold", label: "Partial" },
  PARTIALLY_PAID: { variant: "gold", label: "Partial" },
  DRAFT: { variant: "secondary", label: "Draft" },
  INACTIVE: { variant: "secondary", label: "Inactive" },
  CLOSED: { variant: "secondary", label: "Closed" },

  CANCELLED: { variant: "danger", label: "Cancelled" },
  CANCELED: { variant: "danger", label: "Cancelled" },
  REJECTED: { variant: "danger", label: "Rejected" },
  REFUNDED: { variant: "danger", label: "Refunded" },
  VOID: { variant: "danger", label: "Void" },
  EXPIRED: { variant: "danger", label: "Expired" },

  CONVERTED: { variant: "purple", label: "Converted" },
  SUSPENDED: { variant: "warning", label: "Suspended" },
  UNPAID: { variant: "danger", label: "Unpaid" },
  PARTIAL: { variant: "gold", label: "Partial" },
};

function inferVariant(key: string): TableStatusVariant {
  if (key.includes("PEND") || key.includes("INIT")) return "info";
  if (
    key.includes("RECEIV") ||
    key.includes("COMPLETE") ||
    key.includes("POST") ||
    key.includes("APPROV") ||
    key.includes("ACTIVE") ||
    key.includes("OPEN") ||
    key.includes("PAID")
  ) {
    return "success";
  }
  if (key.includes("CANCEL") || key.includes("REJECT") || key.includes("REFUND") || key.includes("VOID") || key.includes("FAIL")) {
    return "danger";
  }
  if (key.includes("PARTIAL")) return "gold";
  if (key.includes("DRAFT") || key.includes("INACTIVE") || key.includes("CLOSED")) return "secondary";
  return "secondary";
}

export function resolveTableStatus(
  status: string,
  overrides?: { label?: string; variant?: TableStatusVariant },
) {
  const key = normalizeStatusKey(status);
  const mapped = STATUS_MAP[key];
  return {
    variant: overrides?.variant ?? mapped?.variant ?? inferVariant(key),
    label: overrides?.label ?? mapped?.label ?? formatStatusLabel(status),
  };
}
