/** POS terminal UX settings (per device localStorage). */

export const POS_TAX_RATE_KEY = "pos_tax_rate";
export const POS_TOUCH_MODE_KEY = "pos_touch_mode";
export const POS_SOUND_ALERTS_KEY = "pos_sound_alerts";
export const POS_QTY_POPUP_KEY = "pos_qty_popup";

function readBool(key: string, fallback = false): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1" || raw === "true";
}

function writeBool(key: string, value: boolean): boolean {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, value ? "1" : "0");
  }
  return value;
}

export function readPosTaxRate(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(POS_TAX_RATE_KEY);
  if (raw === null) return 0;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function writePosTaxRate(rate: number): number {
  const v = Math.min(100, Math.max(0, rate));
  if (typeof window !== "undefined") {
    localStorage.setItem(POS_TAX_RATE_KEY, String(v));
  }
  return v;
}

export function readPosTouchMode(): boolean {
  return readBool(POS_TOUCH_MODE_KEY, false);
}

export function writePosTouchMode(on: boolean): boolean {
  return writeBool(POS_TOUCH_MODE_KEY, on);
}

export function readPosSoundAlerts(): boolean {
  return readBool(POS_SOUND_ALERTS_KEY, true);
}

export function writePosSoundAlerts(on: boolean): boolean {
  return writeBool(POS_SOUND_ALERTS_KEY, on);
}

export function readPosQtyPopup(): boolean {
  return readBool(POS_QTY_POPUP_KEY, false);
}

export function writePosQtyPopup(on: boolean): boolean {
  return writeBool(POS_QTY_POPUP_KEY, on);
}
