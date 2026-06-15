/** Normalize paginated or plain API list payloads into an array. */
export function parseApiList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const inner = (payload as { data: unknown }).data;
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}
