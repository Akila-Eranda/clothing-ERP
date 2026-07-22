/** Selected POS cashier counter (per browser / terminal). */

const POS_COUNTER_KEY = "pos_selected_counter_id";

export function readPosCounterId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(POS_COUNTER_KEY)?.trim() || "";
}

export function writePosCounterId(id: string): string {
  const v = id.trim();
  if (typeof window !== "undefined") {
    if (v) localStorage.setItem(POS_COUNTER_KEY, v);
    else localStorage.removeItem(POS_COUNTER_KEY);
  }
  return v;
}
