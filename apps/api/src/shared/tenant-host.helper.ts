/**
 * Resolve tenant subdomain from shop host headers (Origin / Referer / X-Forwarded-Host).
 * Matches {slug}.shop.hexalyte.com (and localhost ?tenant= is handled on the web app).
 */
export function extractTenantSlugFromHostHeader(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const raw = value.trim();
    const host = raw.includes("://")
      ? new URL(raw).hostname
      : raw.split("/")[0].split(":")[0];
    const parts = host.toLowerCase().split(".").filter(Boolean);
    // grocery.shop.hexalyte.com → ["grocery","shop","hexalyte","com"]
    if (parts.length >= 4 && parts[1] === "shop") {
      const slug = parts[0];
      if (slug && slug !== "www" && slug !== "shop") return slug;
    }
  } catch {
    /* ignore malformed */
  }
  return undefined;
}

/** Prefer explicit x-tenant-id; else derive from browser host headers. */
export function resolveLoginTenantSlug(opts: {
  headerSlug?: string | null;
  origin?: string | null;
  referer?: string | null;
  forwardedHost?: string | null;
  host?: string | null;
}): string | undefined {
  const explicit = opts.headerSlug?.trim();
  if (explicit) return explicit.toLowerCase();
  return (
    extractTenantSlugFromHostHeader(opts.origin) ||
    extractTenantSlugFromHostHeader(opts.referer) ||
    extractTenantSlugFromHostHeader(opts.forwardedHost) ||
    extractTenantSlugFromHostHeader(opts.host)
  );
}
