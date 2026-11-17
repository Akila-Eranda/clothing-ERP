/**
 * The POS keyboard handler listens on window in the capture phase, so it sees keys before any input does.
 * A widget that needs Escape / Enter / arrow keys for itself (e.g. an open supplier list) marks its container
 * with data-pos-own-keys="true" while it needs them; the POS handler then leaves only those keys alone.
 */
export const POS_OWN_KEYS_ATTR = "data-pos-own-keys";

const OWNED_KEYS = new Set(["Escape", "Enter", "ArrowUp", "ArrowDown", "Home", "End"]);

type MaybeElement = { closest?: (selector: string) => unknown } | null | undefined;

export function isPosKeyOwnedByWidget(target: EventTarget | MaybeElement | null, key: string | undefined | null): boolean {
  if (!key || !OWNED_KEYS.has(key)) return false;
  const el = target as MaybeElement;
  if (!el || typeof el.closest !== "function") return false;
  return el.closest(`[${POS_OWN_KEYS_ATTR}="true"]`) != null;
}
