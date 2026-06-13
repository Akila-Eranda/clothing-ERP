/** Hostname helpers for auth pages (login, forgot password, etc.) */

export const SHOP_DOMAIN_SUFFIX = ".shop.hexalyte.com";

/** True on shop.hexalyte.com (main portal — user must enter workspace slug). */
export function isMainShopLoginDomain(hostname?: string): boolean {
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  const parts = host.split(".");
  return parts.length === 3 && parts[0] === "shop";
}

/** Extract tenant slug from {slug}.shop.hexalyte.com or ?tenant= query on localhost. */
export function getHostnameTenantSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const parts = window.location.hostname.split(".");
    if (parts.length >= 4 && parts[1] === "shop") return parts[0];
    return new URLSearchParams(window.location.search).get("tenant");
  } catch {
    return null;
  }
}

/** jo-lanka → Jo Lanka */
export function formatTenantSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function tenantLoginUrl(subdomain: string): string {
  const slug = subdomain.trim().toLowerCase();
  if (!slug) return "/login";
  return `https://${slug}${SHOP_DOMAIN_SUFFIX}/login`;
}
