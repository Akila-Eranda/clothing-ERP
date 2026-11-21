/**
 * Which function keys must not reach the browser's own handling.
 *
 * Microsoft Edge binds F9 to Reading mode (Immersive Reader). An F9 that the page does not consume
 * switches the HEXAONE tab to `read://…`, which renders the app as a blank or plain-text page.
 * Reproduced on Edge 153 with real keyboard input; preventDefault() on keydown stops it.
 *
 *  - Everywhere in the app: F9 only. It is the POS checkout key and has no other browser meaning,
 *    so blocking it costs nothing. F5 (reload), F11 (full screen) and F12 (DevTools) stay normal
 *    outside the POS.
 *  - While the POS is open: every function key F1–F12. They are POS shortcuts, and the POS
 *    previously consumed them only on its main screen; inside panels and popups (cash close,
 *    transfer, reload, quantity, new customer …) they fell through to the browser
 *    (F9 Reading mode, F7 caret browsing, F5 reload, F1 help, F3 find).
 */

const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;

/** Keys whose browser default is blocked on every page of the app. */
export const APP_WIDE_BLOCKED_KEYS: ReadonlySet<string> = new Set(["F9"]);

export function isFunctionKey(key: string | undefined | null): boolean {
  return typeof key === "string" && FUNCTION_KEY.test(key);
}

/** Should the browser's default action for this key be prevented? */
export function shouldBlockBrowserDefault(key: string | undefined | null, posOpen: boolean): boolean {
  if (!key) return false;
  if (APP_WIDE_BLOCKED_KEYS.has(key)) return true;
  return posOpen && isFunctionKey(key);
}
