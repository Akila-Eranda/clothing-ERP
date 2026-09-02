/** Normalize paginated or plain API list payloads into an array. */
export function parseApiList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && "data" in payload) {
    const inner = (payload as { data: unknown }).data;
    if (Array.isArray(inner)) return inner as T[];
    // NestJS paginate(): { data: T[], meta }
    if (inner && typeof inner === "object" && inner !== null && "data" in inner) {
      const nested = (inner as { data: unknown }).data;
      if (Array.isArray(nested)) return nested as T[];
    }
  }
  return [];
}

/** POS /pos/products — plain array or paginated { items } wrapper. */
export function parsePosProducts<T>(payload: unknown): T[] {
  const direct = parseApiList<T>(payload);
  if (direct.length) return direct;
  if (payload && typeof payload === "object" && payload !== null) {
    const items = (payload as { items?: unknown }).items;
    if (Array.isArray(items)) return items as T[];
    const data = (payload as { data?: unknown }).data;
    if (data && typeof data === "object" && data !== null) {
      const nestedItems = (data as { items?: unknown }).items;
      if (Array.isArray(nestedItems)) return nestedItems as T[];
    }
  }
  return [];
}
