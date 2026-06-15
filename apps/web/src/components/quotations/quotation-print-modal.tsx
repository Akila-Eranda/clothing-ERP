'use client';

import { useState } from 'react';
import { Printer, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { QuotationDocument } from '@/components/quotations/quotation-document';
import {
  buildQuotationPrintHtml,
  quotationToPrintData,
  resolveInvoiceLogoDataUrl,
  type QuotationPrintShop,
} from '@/lib/quotation-document';

interface QuotationLike {
  quoteNumber: string;
  status: string;
  createdAt: string;
  validUntil?: string | null;
  notes?: string | null;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  customer?: {
    firstName: string;
    lastName?: string | null;
    phone?: string;
    email?: string | null;
  } | null;
  items: {
    quantity: number;
    unitPrice: number;
    discount?: number;
    taxRate?: number;
    total?: number;
    variant: { sku: string; name?: string | null; product: { name: string } };
  }[];
}

interface Props {
  quote: QuotationLike;
  shop: QuotationPrintShop;
  onClose: () => void;
}

export function QuotationPrintModal({ quote, shop, onClose }: Props) {
  const [printing, setPrinting] = useState(false);
  const printData = quotationToPrintData(quote, shop);

  async function handlePrint() {
    setPrinting(true);
    try {
      const logoUrl = await resolveInvoiceLogoDataUrl();
      const w = window.open('', '_blank');
      if (!w) {
        toast.error('Pop-up blocked — allow pop-ups to print');
        return;
      }
      w.document.write(buildQuotationPrintHtml(printData, logoUrl));
      w.document.close();
      w.focus();

      const triggerPrint = () => {
        w.focus();
        w.print();
      };

      const img = w.document.querySelector('.logo') as HTMLImageElement | null;
      if (img && logoUrl && !img.complete) {
        img.onload = triggerPrint;
        img.onerror = triggerPrint;
        setTimeout(triggerPrint, 2500);
      } else {
        setTimeout(triggerPrint, 300);
      }
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h2 className="font-bold text-lg">Quotation Preview</h2>
            <p className="text-xs text-muted-foreground font-mono">{quote.quoteNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={handlePrint} disabled={printing}>
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Print / PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 bg-muted/30">
          <QuotationDocument quote={printData} />
        </div>
      </div>
    </div>
  );
}
