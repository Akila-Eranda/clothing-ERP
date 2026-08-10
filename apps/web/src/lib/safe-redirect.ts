/**
 * Post-login redirect target from `?from=`.
 * Only same-origin relative paths — blocks //evil.com, /\evil, javascript:, etc.
 */
export function safeInternalPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;

  let path = raw.trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    return fallback;
  }

  // Reject empty, protocol-relative, backslash tricks, control chars, schemes
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("://") ||
    /[\0-\x1f\x7f]/.test(path) ||
    /^\/[/\\]/.test(path)
  ) {
    return fallback;
  }

  // Path only — drop query/hash injection that could confuse some clients
  const pathOnly = path.split(/[?#]/, 1)[0] ?? fallback;
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) return fallback;

  return pathOnly || fallback;
}
