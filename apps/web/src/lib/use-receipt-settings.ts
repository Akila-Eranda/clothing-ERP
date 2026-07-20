import * as React from "react";
import { api } from "@/lib/api";

export interface ReceiptSettings {
  shopName: string;
  tagline: string;
  logoUrl: string;
  address1: string;
  address2: string;
  phone: string;
  email: string;
  website: string;
  headerText: string;
  footerText: string;
  paperWidth: "58mm" | "80mm";
  /** Thermal / browser receipt colors — light = black on white, dark = white on navy */
  receiptTheme: "light" | "dark";
  showTax: boolean;
  showDiscount: boolean;
  showCashier: boolean;
  showCustomer: boolean;
  showBarcode: boolean;
  fontSize: "small" | "medium" | "large";
  printServerEnabled: boolean;
  printServerUrl: string;
  printServerKey: string;
  printMode: "browser" | "server" | "auto";
  autoPrintAfterSale: boolean;
  printerName: string;
}

export const RECEIPT_DEFAULTS: ReceiptSettings = {
  shopName: "HexaOne",
  tagline: "",
  logoUrl: "",
  address1: "",
  address2: "",
  phone: "",
  email: "",
  website: "",
  headerText: "",
  footerText: "Thank you for shopping with us!",
  paperWidth: "80mm",
  receiptTheme: "light",
  showTax: true,
  showDiscount: true,
  showCashier: true,
  showCustomer: true,
  showBarcode: true,
  fontSize: "medium",
  printServerEnabled: false,
  printServerUrl: "",
  printServerKey: "",
  printMode: "auto",
  autoPrintAfterSale: false,
  printerName: "",
};

const LS_KEY = "receipt_settings_cache";

/** Fired after receipt settings are saved so live consumers (sidebar, POS) refresh instantly. */
export const RECEIPT_SETTINGS_EVENT = "receipt-settings-updated";

export function notifyReceiptSettingsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RECEIPT_SETTINGS_EVENT));
  }
}

function fromCache(): ReceiptSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ReceiptSettings) : null;
  } catch { return null; }
}

function toCache(s: ReceiptSettings) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

export function useReceiptSettings() {
  const [settings, setSettings] = React.useState<ReceiptSettings>(() => fromCache() ?? RECEIPT_DEFAULTS);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const r = await api.get<ReceiptSettings>("/tenants/receipt-settings");
      const s = {
        ...RECEIPT_DEFAULTS,
        ...r.data,
        receiptTheme: r.data?.receiptTheme === "dark" ? "dark" : "light",
      } as ReceiptSettings;
      setSettings(s);
      toCache(s);
    } catch { /* use cache */ }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    const onUpdated = () => {
      const cached = fromCache();
      if (cached) setSettings(cached);
      load();
    };
    window.addEventListener(RECEIPT_SETTINGS_EVENT, onUpdated);
    return () => window.removeEventListener(RECEIPT_SETTINGS_EVENT, onUpdated);
  }, [load]);

  return { settings, loading, reload: load };
}
