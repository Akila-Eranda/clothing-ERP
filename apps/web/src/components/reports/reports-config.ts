export type ReportsSection =
  | "overview"
  | "sales"
  | "purchases"
  | "inventory"
  | "suppliers"
  | "customers"
  | "cashier"
  | "branches"
  | "tax"
  | "expiry"
  | "cheques"
  | "commission"
  | "financial";

export const REPORTS_TABS: { value: ReportsSection; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "sales", label: "Sales" },
  { value: "purchases", label: "Purchases" },
  { value: "inventory", label: "Inventory" },
  { value: "suppliers", label: "Suppliers" },
  { value: "customers", label: "Customers" },
  { value: "cashier", label: "Cashier" },
  { value: "branches", label: "Branches" },
  { value: "tax", label: "Tax" },
  { value: "expiry", label: "Expiry" },
  { value: "cheques", label: "Cheques" },
  { value: "commission", label: "Commission" },
  { value: "financial", label: "Financial" },
];

export function reportsPath(section: ReportsSection) {
  return section === "overview" ? "/reports" : `/reports/${section}`;
}
