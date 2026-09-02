export const TABLE_STATUS_BADGE_CLASS =
  "inline-flex items-center justify-center rounded px-2 py-0.5 text-[10px] font-semibold capitalize whitespace-nowrap border-0 shadow-none leading-tight";

export const TABLE_VALUE_BADGE_CLASS =
  "inline-flex max-w-full items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap border-0 shadow-none leading-tight truncate";

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
  TRIAL: { variant: "info", label: "Trial" },
  PUBLISHED: { variant: "success", label: "Published" },
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

  PENDING: { variant: "warning", label: "Pending" },
  PENDING_APPROVAL: { variant: "warning", label: "Pending" },
  INITIATED: { variant: "warning", label: "Pending" },
  CONFIRMED: { variant: "info", label: "Ordered" },
  SENT: { variant: "info", label: "Ordered" },
  ORDERED: { variant: "info", label: "Ordered" },
  IN_PROGRESS: { variant: "info", label: "In Progress" },

  PARTIALLY_RECEIVED: { variant: "warning", label: "Partial" },
  PARTIALLY_PAID: { variant: "warning", label: "Partial" },
  DRAFT: { variant: "secondary", label: "Draft" },
  INACTIVE: { variant: "secondary", label: "Inactive" },
  CLOSED: { variant: "secondary", label: "Closed" },

  CANCELLED: { variant: "danger", label: "Cancelled" },
  CANCELED: { variant: "danger", label: "Cancelled" },
  REJECTED: { variant: "danger", label: "Rejected" },
  REFUNDED: { variant: "danger", label: "Refunded" },
  VOID: { variant: "danger", label: "Void" },
  EXPIRED: { variant: "danger", label: "Expired" },

  CONVERTED: { variant: "info", label: "Converted" },
  SUSPENDED: { variant: "warning", label: "Suspended" },
  UNPAID: { variant: "danger", label: "Unpaid" },
  PARTIAL: { variant: "warning", label: "Partial" },
};

/** Semantic colors for categorical column values (type, category, channel, etc.) */
const VALUE_MAP: Record<string, TableStatusVariant> = {
  // Channels
  SMS: "info",
  EMAIL: "purple",
  WHATSAPP: "success",
  PHONE: "teal",
  CALL: "teal",
  WALK_IN: "gold",
  WALKIN: "gold",
  ONLINE: "info",
  POS: "default",
  WEB: "purple",

  // Leave types
  ANNUAL: "teal",
  SICK: "danger",
  CASUAL: "info",
  MATERNITY: "purple",
  PATERNITY: "purple",
  UNPAID_LEAVE: "warning",
  NO_PAY: "warning",

  // Stock movement
  IN: "success",
  OUT: "danger",
  ADJUSTMENT: "gold",
  ADJUST: "gold",
  TRANSFER: "info",
  TRANSFER_IN: "success",
  TRANSFER_OUT: "warning",
  RETURN: "purple",
  DAMAGE: "danger",
  DISPOSAL: "danger",
  SALE: "success",
  PURCHASE: "info",

  // Accounting entry types
  DEBIT: "success",
  CREDIT: "danger",
  RECEIPT: "success",
  PAYMENT: "info",
  JOURNAL: "purple",
  CONTRA: "gold",
  DEPOSIT: "success",
  WITHDRAWAL: "danger",
  TRANSFER_PAYMENT: "teal",

  // GRN / procurement sources
  FROM_PO: "info",
  QUICK: "gold",
  DIRECT: "teal",

  // Fleet / account kinds
  FLEET: "success",
  FLEET_ACCOUNT: "success",
  RETAIL: "secondary",

  // Grades
  A: "success",
  B: "gold",
  C: "secondary",

  // System flags
  SYSTEM: "purple",
};

const VALUE_PALETTE: TableStatusVariant[] = [
  "info",
  "success",
  "warning",
  "secondary",
  "danger",
];

function hashValueVariant(value: string): TableStatusVariant {
  const key = normalizeStatusKey(value);
  if (!key) return "secondary";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return VALUE_PALETTE[Math.abs(hash) % VALUE_PALETTE.length];
}

/** Pick a solid badge color for any categorical table value */
export function resolveValueVariant(value: string): TableStatusVariant {
  const key = normalizeStatusKey(value);
  if (!key) return "secondary";
  if (VALUE_MAP[key]) return VALUE_MAP[key];
  if (STATUS_MAP[key]) return STATUS_MAP[key].variant;
  return hashValueVariant(value);
}

function inferVariant(key: string): TableStatusVariant {
  if (key.includes("PEND") || key.includes("INIT")) return "warning";
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
  if (key.includes("PARTIAL")) return "warning";
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
