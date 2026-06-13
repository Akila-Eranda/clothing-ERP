import { api } from '@/lib/api';
import type { ReceiptSettings } from '@/lib/use-receipt-settings';

export type ReceiptPrintType = 'SALE' | 'PRE_BILL' | 'RETURN' | 'TEST';

export interface ReceiptPrintResult {
  logId?: string;
  status?: string;
  serverUsed?: boolean;
  browserFallback?: boolean;
  errorMessage?: string;
}

function browserPrint(html: string, title = 'Receipt') {
  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w) {
    throw new Error('Popup blocked — allow popups to print');
  }
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  setTimeout(() => {
    w.focus();
    w.print();
    setTimeout(() => w.close(), 500);
  }, 200);
}

/** Log print job via API, dispatch to store server when configured, browser print as fallback. */
export async function executeReceiptPrint(opts: {
  html: string;
  printType: ReceiptPrintType;
  invoiceNumber?: string;
  settings: ReceiptSettings;
  title?: string;
}): Promise<ReceiptPrintResult> {
  const { html, printType, invoiceNumber, settings, title } = opts;
  const mode = settings.printMode ?? 'auto';

  let result: ReceiptPrintResult = {};
  try {
    const r = await api.post<ReceiptPrintResult>('/tenants/receipt-print/dispatch', {
      html,
      printType,
      invoiceNumber,
      paperWidth: settings.paperWidth,
    });
    result = r.data ?? {};
  } catch (err) {
    result = { errorMessage: (err as Error).message, browserFallback: true };
  }

  const shouldBrowser =
    mode === 'browser' ||
    (mode === 'auto' && !result.serverUsed) ||
    (mode === 'server' && result.status === 'FAILED');

  if (shouldBrowser) {
    browserPrint(html, title);
  } else if (mode === 'server' && result.status === 'FAILED') {
    throw new Error(result.errorMessage ?? 'Print server failed');
  }

  return result;
}
