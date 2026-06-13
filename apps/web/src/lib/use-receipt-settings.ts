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
  shopName: "FashionERP",
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
  showTax: true,
  showDiscount: true,
  showCashier: true,
  showCustomer: true,
  showBarcode: false,
  fontSize: "medium",
  printServerEnabled: false,
  printServerUrl: "",
  printServerKey: "",
  printMode: "auto",
  autoPrintAfterSale: false,
  printerName: "",
};

const LS_KEY = "receipt_settings_cache";

function fromCache(): ReceiptSettings | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ReceiptSettings) : null;
  } catch { return null; }
}

function toCache(s: ReceiptSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

export function useReceiptSettings() {
  const [settings, setSettings] = React.useState<ReceiptSettings>(() => fromCache() ?? RECEIPT_DEFAULTS);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const r = await api.get<ReceiptSettings>("/tenants/receipt-settings");
      const s = { ...RECEIPT_DEFAULTS, ...r.data } as ReceiptSettings;
      setSettings(s);
      toCache(s);
    } catch { /* use cache */ }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return { settings, loading, reload: load };
}
