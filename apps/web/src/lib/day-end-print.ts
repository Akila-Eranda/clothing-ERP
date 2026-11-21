import { api } from "@/lib/api";
import { executeReceiptPrint } from "@/lib/receipt-print";
import type { ReceiptSettings } from "@/lib/use-receipt-settings";
import { buildDayEndReceiptHtml, type DayEndReport } from "@/lib/day-end-receipt";
import { downloadFile } from "@/lib/upload";

/**
 * Prints the day-end report on the POS thermal printer (never A4): one cashier shift, or a branch /
 * counter for a date. Uses the same print path as sale receipts (store print server, browser fallback).
 */
export async function printDayEndReport(
  target: { registerId: string } | { date: string; counterId?: string },
  settings: ReceiptSettings,
) {
  const path = "registerId" in target
    ? `/cash/${encodeURIComponent(target.registerId)}/day-end-report`
    : `/cash/day-end-report?date=${encodeURIComponent(target.date)}${target.counterId ? `&counterId=${encodeURIComponent(target.counterId)}` : ""}`;
  const res = await api.get<DayEndReport>(path);
  if (!res.data) throw new Error("No day-end data");
  const html = buildDayEndReceiptHtml(res.data, settings);
  return executeReceiptPrint({
    html,
    printType: "DAY_END",
    invoiceNumber: "registerId" in target ? `SHIFT-${target.registerId.slice(-8).toUpperCase()}` : `DAY-${target.date}`,
    settings,
    title: "Day-End Report",
    paperWidth: settings.paperWidth,
  });
}

export async function downloadDayEndPdf(target: { date: string; counterId?: string }) {
  const query = `date=${encodeURIComponent(target.date)}${target.counterId ? `&counterId=${encodeURIComponent(target.counterId)}` : ""}`;
  await downloadFile(`/cash/day-end-report/pdf?${query}`, `day-end-${target.date}.pdf`);
}
