export interface AppPermission {
  id: string;
  resource: string;
  action: string;
  description?: string | null;
}

export interface RolePermissionLink {
  permission: AppPermission;
}

export const RESOURCE_LABELS: Record<string, string> = {
  users: "Users & Staff",
  roles: "Roles & Permissions",
  products: "Products",
  inventory: "Inventory & Stock",
  sales: "Sales & POS",
  customers: "Customers",
  suppliers: "Suppliers",
  purchases: "Purchases & GRN",
  accounting: "Accounting & Finance",
  hr: "HR & Payroll",
  reports: "Reports & Analytics",
  branches: "Branches",
  settings: "Shop Settings",
  cash: "Cash Management",
};

export const ACTION_LABELS: Record<string, string> = {
  create: "Create",
  read: "View",
  update: "Edit",
  delete: "Delete",
  export: "Export",
};

export const RESOURCE_ORDER = [
  "sales",
  "products",
  "inventory",
  "customers",
  "purchases",
  "suppliers",
  "cash",
  "accounting",
  "reports",
  "hr",
  "users",
  "roles",
  "branches",
  "settings",
];

export function permissionKey(p: Pick<AppPermission, "resource" | "action">): string {
  return `${p.resource}:${p.action}`;
}

export function formatPermissionLabel(p: Pick<AppPermission, "resource" | "action">): string {
  const resource = RESOURCE_LABELS[p.resource] ?? p.resource;
  const action = ACTION_LABELS[p.action] ?? p.action;
  return `${action} ${resource}`;
}

export function groupPermissionsByResource(permissions: AppPermission[]): Map<string, AppPermission[]> {
  const map = new Map<string, AppPermission[]>();
  for (const p of permissions) {
    const list = map.get(p.resource) ?? [];
    list.push(p);
    map.set(p.resource, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => {
      const ai = Object.keys(ACTION_LABELS).indexOf(a.action);
      const bi = Object.keys(ACTION_LABELS).indexOf(b.action);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }
  return map;
}

export function sortedResourceKeys(groups: Map<string, AppPermission[]>): string[] {
  return [...groups.keys()].sort((a, b) => {
    const ai = RESOURCE_ORDER.indexOf(a);
    const bi = RESOURCE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function rolePermissionKeys(
  permissions: RolePermissionLink[] | undefined,
): Set<string> {
  return new Set((permissions ?? []).map((rp) => permissionKey(rp.permission)));
}

export function diffPermissionKeys(current: Set<string>, next: Set<string>) {
  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];

  for (const key of next) {
    if (current.has(key)) unchanged.push(key);
    else added.push(key);
  }
  for (const key of current) {
    if (!next.has(key)) removed.push(key);
  }

  const sortKeys = (keys: string[]) =>
    keys.sort((a, b) => {
      const [ar, aa] = a.split(":");
      const [br, ba] = b.split(":");
      const ri = RESOURCE_ORDER.indexOf(ar) - RESOURCE_ORDER.indexOf(br);
      if (ri !== 0) return ri;
      return (ACTION_LABELS[aa] ?? aa).localeCompare(ACTION_LABELS[ba] ?? ba);
    });

  return {
    added: sortKeys(added),
    removed: sortKeys(removed),
    unchanged: sortKeys(unchanged),
  };
}

export function keyToLabel(key: string): string {
  const [resource, action] = key.split(":");
  return formatPermissionLabel({ resource, action });
}
