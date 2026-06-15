import * as React from "react";
import { api } from "@/lib/api";
import type { ReceiptSettings } from "@/lib/use-receipt-settings";

export interface ReceiptPrintStatusResponse {
  printMode: string;
  printerName: string | null;
  paperWidth: string;
  printServerEnabled: boolean;
  printServerConfigured: boolean;
  serverOnline: boolean | null;
  lastPrint: { status: string; at: string; mode: string; error: string | null } | null;
}

export interface DeviceStatusDisplay {
  label: string;
  detail: string;
  color: string;
}

export function formatScannerDetail(lastScanAt: Date | null, now: Date): string {
  if (!lastScanAt) return "Listening";
  const sec = Math.floor((now.getTime() - lastScanAt.getTime()) / 1000);
  if (sec < 5) return "Just scanned";
  if (sec < 60) return `Scan ${sec}s ago`;
  if (sec < 3600) return `Scan ${Math.floor(sec / 60)}m ago`;
  return "Ready";
}

export function isScannerActive(lastScanAt: Date | null, scanFlash: boolean, now: Date): boolean {
  if (scanFlash) return true;
  if (!lastScanAt) return false;
  return now.getTime() - lastScanAt.getTime() < 5000;
}

function buildPrinterDisplay(
  status: ReceiptPrintStatusResponse | null,
  receiptSettings: ReceiptSettings,
  loading: boolean,
): DeviceStatusDisplay {
  if (loading && !status) {
    return { label: "Printer", detail: "Checking…", color: "#6a8ab8" };
  }
  const mode = status?.printMode ?? receiptSettings.printMode ?? "auto";
  const name = status?.printerName || receiptSettings.printerName;

  if (mode === "browser") {
    return { label: name || "Printer", detail: "Browser print", color: "#10b981" };
  }
  if (receiptSettings.printServerEnabled && receiptSettings.printServerUrl) {
    const online = status?.serverOnline;
    if (online === true) {
      return { label: name || "Print server", detail: "Online", color: "#10b981" };
    }
    if (online === false) {
      const fallback = mode === "auto" ? " · Browser fallback" : "";
      return {
        label: name || "Print server",
        detail: `Offline${fallback}`,
        color: mode === "server" ? "#ef4444" : "#f59e0b",
      };
    }
    return { label: name || "Print server", detail: "Configured", color: "#6a8ab8" };
  }
  if (mode === "server") {
    return { label: "Printer", detail: "Not configured", color: "#ef4444" };
  }
  return { label: name || "Printer", detail: "Browser fallback", color: "#6a8ab8" };
}

export function usePosPrinterStatus(posOpen: boolean, receiptSettings: ReceiptSettings) {
  const [status, setStatus] = React.useState<ReceiptPrintStatusResponse | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!posOpen) return;
    setLoading(true);
    try {
      const r = await api.get<ReceiptPrintStatusResponse>("/tenants/receipt-print/status");
      setStatus(r.data);
    } catch {
      /* keep last known status */
    } finally {
      setLoading(false);
    }
  }, [posOpen]);

  React.useEffect(() => {
    if (!posOpen) return;
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [posOpen, refresh]);

  const display = React.useMemo(
    () => buildPrinterDisplay(status, receiptSettings, loading),
    [status, receiptSettings, loading],
  );

  return { display, refresh };
}
