"use client";

import { posQrCache } from "@/lib/pos-qr-cache";
import * as React from "react";
import { Loader2, Maximize2, QrCode, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { resolvePublicAssetUrl } from "@/lib/upload";
import { computeQrFee, type QrFeeSettings } from "@/lib/qr-fee";
import type { CustomerDisplayQrPayment } from "@/lib/pos-customer-display";
import { buildQrDisplayPayment } from "@/lib/customer-display-core";

export type PosQrCode = {
  id: string;
  label: string;
  mode: "STATIC" | "DYNAMIC";
  imageUrl: string | null;
  bankAccountId: string;
  isDefault: boolean;
  merchantName: string | null;
  bankAccount?: PosQrBankAccount | null;
};

export type PosQrBankAccount = {
  id: string;
  name: string;
  code?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
};

type Rendered = {
  qrCodeId?: string;
  mode: "STATIC" | "DYNAMIC";
  imageUrl: string | null;
  dataUrl: string | null;
  merchantName: string | null;
  amount: number;
  bankAccount?: PosQrBankAccount | null;
};

async function loadPosQrCodes(force = false): Promise<PosQrCode[]> {
  const cached = posQrCache.get(force) as PosQrCode[] | null;
  if (cached) return cached;
  const r = await api.get<PosQrCode[]>("/payment-qr/pos");
  const codes = Array.isArray(r.data) ? r.data : [];
  posQrCache.set(codes);
  return codes;
}

/**
 * QR payment at the POS: pick the shop's QR code (this also picks its bank account) and show it to
 * the customer. DYNAMIC codes carry the exact bill amount; STATIC codes show the uploaded image.
 */
export function PosQrPayment({
  amount: billAmount,
  feeSettings,
  bankAccountId,
  qrCodeId,
  onSelect,
  onDisplayChange,
}: {
  /** The amount the customer pays by QR (gross). The bank deducts the QR fee from it; the customer never pays more. */
  amount: number;
  feeSettings?: QrFeeSettings;
  bankAccountId: string;
  qrCodeId: string;
  onSelect: (sel: { qrCodeId: string; bankAccountId: string }) => void;
  /** What the customer must see for this QR (exactly the QR / bank account / amount shown here); null when none. */
  onDisplayChange?: (payment: CustomerDisplayQrPayment | null) => void;
}) {
  // The QR (dynamic) and the customer view carry the gross amount; the fee is the shop's bank charge, shown to
  // the cashier only (gross, %, fee, net) before confirming.
  const fee = React.useMemo(() => computeQrFee(billAmount, feeSettings ?? { threshold: Number.POSITIVE_INFINITY, percent: 0 }), [billAmount, feeSettings]);
  const amount = fee.amount;
  const [codes, setCodes] = React.useState<PosQrCode[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rendered, setRendered] = React.useState<Rendered | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [enlarged, setEnlarged] = React.useState(false);
  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;
  const onDisplayRef = React.useRef(onDisplayChange);
  onDisplayRef.current = onDisplayChange;

  React.useEffect(() => {
    let alive = true;
    loadPosQrCodes()
      .then((c) => { if (alive) setCodes(c); })
      .catch((e: unknown) => { if (alive) { setCodes([]); setError((e as Error).message || "Could not load QR codes"); } });
    return () => { alive = false; };
  }, []);

  // Pre-select: the code already chosen, else one for the chosen bank account, else the default.
  React.useEffect(() => {
    if (!codes?.length) return;
    if (qrCodeId && codes.some((c) => c.id === qrCodeId)) return;
    if (bankAccountId) {
      const pick = codes.find((c) => c.bankAccountId === bankAccountId);
      onSelectRef.current({ qrCodeId: pick?.id ?? "", bankAccountId });
      return;
    }
    const pick = codes.find((c) => c.isDefault) || codes[0];
    if (pick) onSelectRef.current({ qrCodeId: pick.id, bankAccountId: pick.bankAccountId });
  }, [codes, qrCodeId, bankAccountId]);

  const selected = codes?.find((c) => c.id === qrCodeId) ?? null;
  const missingBankQr = !!bankAccountId && codes !== null && !selected;

  React.useEffect(() => {
    if (!selected || !(amount > 0)) { setRendered(null); return; }
    let alive = true;
    setRendering(true);
    const t = setTimeout(() => {
      api.post<Rendered>(`/payment-qr/${selected.id}/render`, { amount: Math.round(amount * 100) / 100 })
        .then((r) => { if (alive) { setRendered(r.data ?? null); setError(null); } })
        .catch((e: unknown) => { if (alive) { setRendered(null); setError((e as Error).message || "Could not show the QR"); } })
        .finally(() => { if (alive) setRendering(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [selected, amount]);

  // A QR is shown only if it was rendered for THIS code and THIS amount; otherwise the previous account's QR
  // would stay visible while the new one loads (stale QR).
  const renderedIsCurrent = !!rendered && !!selected && rendered.qrCodeId === selected.id && rendered.amount === amount;
  const src = renderedIsCurrent ? (rendered?.dataUrl ?? (rendered?.imageUrl ? resolvePublicAssetUrl(rendered.imageUrl) : "")) : "";

  // The Customer Display gets the same QR, amount and bank account the cashier sees (single source of truth).
  const display = React.useMemo<CustomerDisplayQrPayment | null>(
    () => missingBankQr
      ? {
          status: "unavailable",
          qrCodeId: "",
          bankAccountId,
          label: "QR payment",
          mode: "STATIC",
          amount,
          src: "",
          message: "No QR image is configured for this bank account. Configure it in Accounting → Cash & Bank → Accounts.",
        }
      : buildQrDisplayPayment({ selected, rendered, rendering, error, amount, resolveImage: resolvePublicAssetUrl }),
    [selected, rendered, rendering, error, amount, missingBankQr, bankAccountId],
  );
  const displayKey = JSON.stringify(display);
  React.useEffect(() => { onDisplayRef.current?.(display); }, [displayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => () => onDisplayRef.current?.(null), []);

  // Shown to the cashier before confirming, with or without a QR code image (the API applies the fee either way).
  const feeBlock = fee.feeAmount > 0 && (
    <div className="space-y-0.5 text-[11px] tabular-nums" data-testid="qr-fee-breakdown" style={{ color: "var(--pos-muted)" }}>
      <div className="flex justify-between gap-3"><span>QR amount (gross)</span><span>LKR {formatNumber(fee.amount)}</span></div>
      <div className="flex justify-between gap-3"><span>QR fee ({fee.feePercent}%) deducted</span><span>−LKR {formatNumber(fee.feeAmount)}</span></div>
      <div className="flex justify-between gap-3 font-semibold"><span>Net received</span><span>LKR {formatNumber(fee.netAmount)}</span></div>
    </div>
  );

  if (codes === null) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--pos-muted)" }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading QR codes…
      </div>
    );
  }
  if (!codes.length) {
    return (
      <div className="space-y-2">
        <p className="text-[11px]" style={{ color: "var(--pos-muted)" }}>
          No eligible QR image is configured for this bank account. Configure it in Accounting → Cash & Bank → Accounts.
        </p>
        {fee.feeAmount > 0 && (
          <div className="rounded-xl p-2" style={{ background: "var(--pos-card)", border: "1px solid var(--pos-border)" }}>
            {feeBlock}
          </div>
        )}
      </div>
    );
  }

  const qrImage = (size: number) =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={`QR code for ${selected?.label ?? "payment"}`} width={size} height={size} className="rounded-lg bg-white p-1.5" style={{ width: size, height: size, objectFit: "contain" }} />
    ) : (
      <div className="flex items-center justify-center rounded-lg" style={{ width: size, height: size, background: "var(--pos-card)" }}>
        {rendering ? <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--pos-muted)" }} /> : <QrCode className="h-8 w-8" style={{ color: "var(--pos-muted)" }} />}
      </div>
    );

  return (
    <div className="space-y-2">
      {codes.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="QR code">
          {codes.map((c) => {
            const on = c.id === qrCodeId;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onSelect({ qrCodeId: c.id, bankAccountId: c.bankAccountId })}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border"
                style={{
                  background: on ? "var(--pos-accent)" : "var(--pos-card)",
                  borderColor: on ? "var(--pos-accent)" : "var(--pos-border)",
                  color: on ? "#fff" : "var(--pos-text)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <div className="flex items-center gap-3 rounded-xl p-2" style={{ background: "var(--pos-card)", border: "1px solid var(--pos-border)" }}>
          {qrImage(132)}
          <div className="min-w-0 flex-1 space-y-1 text-xs">
            <p className="font-bold truncate" style={{ color: "var(--pos-text)" }}>{selected.label}</p>
            {(rendered?.merchantName ?? selected.merchantName) && (
              <p className="truncate" style={{ color: "var(--pos-muted)" }}>{rendered?.merchantName ?? selected.merchantName}</p>
            )}
            <p className="text-base font-bold tabular-nums" style={{ color: "var(--pos-text)" }}>
              LKR {formatNumber(amount)}
            </p>
            {feeBlock}
            <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>
              {rendered?.mode === "DYNAMIC" ? "Amount is in the QR" : "Customer enters the amount"}
            </p>
            <button
              type="button"
              onClick={() => setEnlarged(true)}
              disabled={!src}
              className="inline-flex items-center gap-1 text-[11px] font-semibold disabled:opacity-40"
              style={{ color: "var(--pos-accent-soft)" }}
            >
              <Maximize2 className="h-3 w-3" /> Show to customer
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-[11px]" style={{ color: "var(--pos-warn-soft)" }}>{error}</p>}
      {missingBankQr && <p className="text-[11px]" style={{ color: "var(--pos-warn-soft)" }}>No QR image is configured for the selected bank account. Choose another account or configure one in Accounting → Cash &amp; Bank → Accounts.</p>}
      {enlarged && src && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QR code for the customer"
          className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-4 p-6"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setEnlarged(false)}
        >
          <button type="button" aria-label="Close" className="absolute right-4 top-4 rounded-lg p-2 text-white hover:bg-white/10" onClick={() => setEnlarged(false)}>
            <X className="h-6 w-6" />
          </button>
          {qrImage(Math.min(420, typeof window !== "undefined" ? window.innerWidth - 48 : 420))}
          <p className="text-2xl font-bold text-white tabular-nums">LKR {formatNumber(amount)}</p>
          <p className="text-sm text-white/70">{selected?.label}</p>
        </div>
      )}
    </div>
  );
}
