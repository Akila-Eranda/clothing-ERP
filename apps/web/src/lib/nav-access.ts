/**
 * Permission-aware navigation.
 *
 * The API puts the user's effective permissions ("resource:action") in the access-token claims and
 * enforces them with global guards. This module only decides what to SHOW in the menu — hiding a
 * link is a convenience, never authorization. Every endpoint is still protected server-side.
 *
 * The route → permission table mirrors the `@RequirePermissions` read permission of the controller
 * that backs each page (apps/api/src/modules/**). Routes without an entry are always visible.
 */

export interface NavClaims {
  roles: string[];
  /** `null` = claims could not be read (show everything; the server still enforces). */
  permissions: Set<string> | null;
}

/** Longest matching prefix wins. */
const ROUTE_PERMISSIONS: [prefix: string, permission: string][] = [
  ["/sales", "sales:read"],
  ["/returns", "sales:read"],
  ["/customers", "customers:read"],
  ["/products", "products:read"],
  ["/categories", "products:read"],
  ["/brands", "products:read"],
  ["/collections", "products:read"],
  ["/promotions", "products:read"],
  ["/inventory", "inventory:read"],
  ["/warehouse", "inventory:read"],
  ["/suppliers", "suppliers:read"],
  ["/purchases", "purchases:read"],
  ["/accounting", "accounting:read"],
  ["/expenses", "accounting:read"],
  ["/cash", "cash:read"],
  ["/reports", "reports:read"],
  ["/hr", "hr:read"],
  ["/users", "users:read"],
];

function decodeClaims(token: string | null | undefined): { roles?: unknown; permissions?: unknown } | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { roles?: unknown; permissions?: unknown };
  } catch {
    return null;
  }
}

export function readNavClaims(token: string | null | undefined): NavClaims {
  const c = decodeClaims(token);
  if (!c) return { roles: [], permissions: null };
  const roles = Array.isArray(c.roles) ? c.roles.map((r) => String(r).toUpperCase().replace(/-/g, "_")) : [];
  // Platform super admins bypass permission checks on the server as well.
  if (roles.includes("SUPER_ADMIN")) return { roles, permissions: null };
  if (!Array.isArray(c.permissions)) return { roles, permissions: null };
  return { roles, permissions: new Set(c.permissions.map(String)) };
}

export function requiredPermissionFor(href: string | undefined): string | null {
  if (!href) return null;
  let best: [string, string] | null = null;
  for (const entry of ROUTE_PERMISSIONS) {
    const [prefix] = entry;
    if ((href === prefix || href.startsWith(prefix + "/")) && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}

export function canSeeRoute(href: string | undefined, claims: NavClaims): boolean {
  if (!claims.permissions) return true;
  const need = requiredPermissionFor(href);
  return !need || claims.permissions.has(need);
}

/** Generic filter: drops inaccessible links, then parents/groups left with nothing to show. */
export function filterNavByClaims<
  I extends { href?: string; sectionLabel?: boolean; children?: I[] },
  G extends { items: I[] },
>(groups: G[], claims: NavClaims): G[] {
  if (!claims.permissions) return groups;

  const keepItem = (item: I): I | null => {
    if (item.sectionLabel) return item;
    if (item.children?.length) {
      const children = prune(item.children);
      // A parent stays only if at least one real child link remains.
      return children.some((c) => !c.sectionLabel) ? { ...item, children } : null;
    }
    return canSeeRoute(item.href, claims) ? item : null;
  };

  /** Drops section labels that no longer have a link under them. */
  const prune = (list: I[]): I[] => {
    const kept = list.map(keepItem).filter((x): x is I => x !== null);
    return kept.filter((it, i) => {
      if (!it.sectionLabel) return true;
      const next = kept[i + 1];
      return !!next && !next.sectionLabel;
    });
  };

  return groups
    .map((g) => ({ ...g, items: prune(g.items) }))
    .filter((g) => g.items.length > 0);
}
