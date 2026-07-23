"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Package, ShoppingBag, Wifi, WifiOff } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { resolvePublicAssetUrl } from "@/lib/upload";
import {
  readCustomerDisplayState,
  subscribeCustomerDisplayState,
  type CustomerDisplayState,
} from "@/lib/pos-customer-display";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { cn } from "@/lib/utils";

export interface DisplayBranding {
  shopName: string;
  tagline: string;
  logoUrl: string;
}

export function mergeDisplayBranding(
  live: CustomerDisplayState | null | undefined,
  receipt: { shopName?: string; tagline?: string; logoUrl?: string },
): DisplayBranding {
  return {
    shopName: live?.shopName?.trim() || receipt.shopName?.trim() || "Store",
    tagline: live?.tagline?.trim() || receipt.tagline?.trim() || "",
    logoUrl: live?.logoUrl?.trim() || receipt.logoUrl?.trim() || "",
  };
}

function ShopBrandLogo({
  logoUrl,
  shopName,
  size = "md",
  className,
}: {
  logoUrl?: string;
  shopName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const src = logoUrl ? resolvePublicAssetUrl(logoUrl) : null;
  if (!src) return null;
  const heights = { sm: "h-10 max-h-10", md: "h-20 max-h-20", lg: "h-28 max-h-28" };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={shopName}
      className={cn("w-auto object-contain object-center", heights[size], className)}
    />
  );
}

function ProductImage({ url, name, className }: { url?: string; name: string; className?: string }) {
  const src = url ? resolvePublicAssetUrl(url) : null;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className={cn("object-cover", className)} />
    );
  }
  return (
    <div className={cn("flex items-center justify-center bg-white/5", className)}>
      <Package className="h-1/3 w-1/3 text-white/20" />
    </div>
  );
}

function TotalsPanel({ state, compact }: { state: CustomerDisplayState; compact?: boolean }) {
  const { currency } = state;
  const discLabel =
    state.discountPercent && state.discountPercent > 0
      ? `Discount (${state.discountPercent}%)`
      : "Discount";
  return (
    <div className={cn("space-y-2", compact ? "text-base" : "text-lg")}>
      <div className="flex justify-between" style={{ color: "#94a3b8" }}>
        <span>Subtotal</span>
        <span>{currency} {formatNumber(state.subtotal)}</span>
      </div>
      {state.discount > 0.001 && (
        <div
          className="flex justify-between items-center rounded-xl px-3 py-2"
          style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)", color: "var(--pos-success-soft, #047857)" }}
        >
          <span className="font-bold">{discLabel}</span>
          <span className="font-black tabular-nums">− {currency} {formatNumber(state.discount)}</span>
        </div>
      )}
      {state.taxRate > 0 && (
        <div className="flex justify-between" style={{ color: "#94a3b8" }}>
          <span>Tax ({state.taxRate}%)</span>
          <span>{currency} {formatNumber(state.tax)}</span>
        </div>
      )}
      <div
        className="flex justify-between items-baseline pt-3 mt-1 border-t"
        style={{ borderColor: "rgba(255,255,255,0.12)" }}
      >
        <span className={cn("font-bold text-white", compact ? "text-xl" : "text-2xl")}>Total</span>
        <span className={cn("font-black", compact ? "text-3xl" : "text-4xl")} style={{ color: "#4f6ef7" }}>
          {currency} {formatNumber(state.total)}
        </span>
      </div>
    </div>
  );
}

function CheckoutCashPanel({ state }: { state: CustomerDisplayState }) {
  const isCash = state.paymentMethod?.toLowerCase() === "cash";
  const tendered = state.cashTendered ?? 0;
  const hasTendered = isCash && tendered > 0;
  const change = state.changeDue ?? 0;
  const showChange = hasTendered && change > 0;
  const balanceDue = hasTendered && tendered < state.total ? state.total - tendered : 0;

  return (
    <div className="mb-4 space-y-3">
      <p className="text-center text-xs font-bold uppercase tracking-widest" style={{ color: "#6a8ab8" }}>
        {isCash ? "Paying with Cash" : `Paying with ${state.paymentMethod ?? "…"}`}
      </p>

      {isCash && (
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: "rgba(79,110,247,0.12)", border: "1px solid rgba(79,110,247,0.3)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#93c5fd" }}>Amount Due</p>
            <p className="text-3xl font-black text-white">{state.currency} {formatNumber(state.total)}</p>
          </div>
          <div
            className="rounded-2xl p-4 text-center"
            style={{
              background: hasTendered ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${hasTendered ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#6ee7b7" }}>Cash Received</p>
            <p className="text-3xl font-black text-white">
              {hasTendered ? `${state.currency} ${formatNumber(tendered)}` : "—"}
            </p>
          </div>
        </div>
      )}

      {showChange && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl p-5 text-center"
          style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.2),rgba(5,150,105,0.15))", border: "2px solid rgba(16,185,129,0.45)" }}
        >
          <p className="text-sm font-bold uppercase tracking-widest mb-1" style={{ color: "#6ee7b7" }}>Your Change</p>
          <p className="text-5xl font-black text-white">{state.currency} {formatNumber(change)}</p>
        </motion.div>
      )}

      {hasTendered && tendered >= state.total && change === 0 && (
        <div
          className="rounded-xl px-4 py-3 text-center"
          style={{ background: "rgba(79,110,247,0.12)", border: "1px solid rgba(79,110,247,0.3)" }}
        >
          <p className="text-base font-semibold text-white">Exact amount — no change</p>
        </div>
      )}

      {isCash && balanceDue > 0 && (
        <div
          className="rounded-xl px-4 py-3 text-center"
          style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "#fcd34d" }}>
            Balance due: {state.currency} {formatNumber(balanceDue)}
          </p>
        </div>
      )}

      {!isCash && (
        <p className="text-center text-sm font-semibold animate-pulse" style={{ color: "#f59e0b" }}>
          Processing payment…
        </p>
      )}
    </div>
  );
}

function IdleScreen({ branding }: { branding: DisplayBranding }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mb-8"
      >
        <ShopBrandLogo logoUrl={branding.logoUrl} shopName={branding.shopName} size="lg" className="mx-auto mb-4" />
        <h1 className="text-4xl font-black text-white">{branding.shopName}</h1>
        {branding.tagline && (
          <p className="text-xl mt-2" style={{ color: "#6a8ab8" }}>{branding.tagline}</p>
        )}
      </motion.div>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-3 px-6 py-4 rounded-2xl"
        style={{ background: "rgba(79,110,247,0.12)", border: "1px solid rgba(79,110,247,0.25)" }}
      >
        <ShoppingBag className="h-8 w-8" style={{ color: "#4f6ef7" }} />
        <p className="text-xl text-white font-semibold">Welcome — your items will appear here</p>
      </motion.div>
    </div>
  );
}

function WaitingScreen({ branding }: { branding: DisplayBranding }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
      <ShopBrandLogo logoUrl={branding.logoUrl} shopName={branding.shopName} size="lg" className="mx-auto mb-6" />
      <WifiOff className="h-12 w-12 mb-4" style={{ color: "#4a6a8a" }} />
      <h2 className="text-3xl font-bold text-white mb-2">{branding.shopName}</h2>
      <p className="text-lg" style={{ color: "#6a8ab8" }}>Waiting for cashier — open POS to start</p>
    </div>
  );
}

function ThankYouScreen({ state }: { state: CustomerDisplayState }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center flex-1 text-center px-8"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
        className="h-24 w-24 rounded-full flex items-center justify-center mb-6"
        style={{ background: "rgba(16,185,129,0.15)", border: "2px solid rgba(16,185,129,0.4)" }}
      >
        <CheckCircle2 className="h-12 w-12" style={{ color: "#10b981" }} />
      </motion.div>
      <h2 className="text-4xl font-black text-white mb-2">Thank you!</h2>
      {state.customerName && (
        <p className="text-xl mb-4" style={{ color: "#6a8ab8" }}>{state.customerName}</p>
      )}
      <p className="text-5xl font-black mb-2" style={{ color: "#4f6ef7" }}>
        {state.currency} {formatNumber(state.total)}
      </p>
      {state.discount > 0.001 && (
        <div
          className="px-6 py-3 rounded-2xl mb-4"
          style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)" }}
        >
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#6ee7b7" }}>
            {state.discountPercent ? `You saved ${state.discountPercent}%` : "You saved"}
          </p>
          <p className="text-3xl font-black" style={{ color: "var(--pos-success-soft, #34d399)" }}>
            {state.currency} {formatNumber(state.discount)}
          </p>
        </div>
      )}
      {state.invoiceNumber && (
        <p className="text-base font-mono mb-2" style={{ color: "#6a8ab8" }}>{state.invoiceNumber}</p>
      )}
      {state.paymentMethod && (
        <p className="text-sm uppercase tracking-wider mb-4" style={{ color: "#94a3b8" }}>
          Paid via {state.paymentMethod.replace(/_/g, " ")}
        </p>
      )}
      {(state.changeDue ?? 0) > 0 && (
        <div
          className="px-8 py-4 rounded-2xl mt-2"
          style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}
        >
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#6ee7b7" }}>Your Change</p>
          <p className="text-4xl font-black text-white">{state.currency} {formatNumber(state.changeDue ?? 0)}</p>
        </div>
      )}
      <p className="text-base mt-8" style={{ color: "#4a6a8a" }}>Please collect your receipt</p>
    </motion.div>
  );
}

function ShoppingScreen({ state }: { state: CustomerDisplayState }) {
  return (
    <div className="flex flex-1 min-h-0 gap-6 p-6">
      {/* Featured item */}
      <div className="w-[38%] flex flex-col min-h-0">
        <AnimatePresence mode="wait">
          {state.lastAdded ? (
            <motion.div
              key={state.lastAdded.variantId + state.lastAdded.quantity}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              className="flex-1 flex flex-col rounded-3xl overflow-hidden"
              style={{ background: "#162338", border: "1px solid #1e3356" }}
            >
              <div className="relative flex-1 min-h-[200px]">
                <ProductImage
                  url={state.lastAdded.imageUrl}
                  name={state.lastAdded.productName}
                  className="absolute inset-0 w-full h-full"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to top, rgba(13,27,46,0.95) 0%, transparent 55%)" }}
                />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#4f6ef7" }}>
                    {state.phase === "checkout" ? "Your order" : "Just added"}
                  </p>
                  <h2 className="text-2xl font-black text-white leading-tight">{state.lastAdded.productName}</h2>
                  {state.lastAdded.variantName && state.lastAdded.variantName !== "Default" && (
                    <p className="text-base mt-1" style={{ color: "#94a3b8" }}>{state.lastAdded.variantName}</p>
                  )}
                  <div className="flex items-end justify-between mt-4">
                    <span className="text-sm font-mono" style={{ color: "#6a8ab8" }}>{state.lastAdded.sku}</span>
                    <div className="text-right">
                      <p className="text-3xl font-black text-white">
                        {state.currency} {formatNumber(state.lastAdded.unitPrice)}
                      </p>
                      <p className="text-sm" style={{ color: "#6a8ab8" }}>× {state.lastAdded.quantity}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty-feature"
              className="flex-1 flex items-center justify-center rounded-3xl"
              style={{ background: "#162338", border: "1px dashed #1e3356" }}
            >
              <Package className="h-16 w-16" style={{ color: "#2a3a5c" }} />
            </motion.div>
          )}
        </AnimatePresence>
        {state.customerName && (
          <div
            className="mt-4 px-5 py-3 rounded-2xl flex items-center gap-3 shrink-0"
            style={{ background: "rgba(79,110,247,0.12)", border: "1px solid rgba(79,110,247,0.25)" }}
          >
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
              style={{ background: "linear-gradient(135deg,#4f6ef7,#7c3aed)" }}
            >
              {state.customerName[0]}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: "#6a8ab8" }}>Customer</p>
              <p className="text-base font-bold text-white">{state.customerName}</p>
            </div>
          </div>
        )}
      </div>

      {/* Cart list + totals */}
      <div
        className="flex-1 flex flex-col min-h-0 rounded-3xl overflow-hidden"
        style={{ background: "#0f1f3a", border: "1px solid #1e3356" }}
      >
        <div className="px-6 py-4 border-b shrink-0 flex items-center justify-between" style={{ borderColor: "#1e3356" }}>
          <h3 className="text-xl font-bold text-white">
            {state.phase === "checkout" ? "Payment" : "Your Items"}
          </h3>
          <span
            className="text-sm font-bold px-3 py-1 rounded-full"
            style={{ background: "rgba(79,110,247,0.2)", color: "#93c5fd" }}
          >
            {state.itemCount} {state.itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <AnimatePresence initial={false}>
            {state.items.map((item) => (
              <motion.div
                key={item.variantId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-4 p-3 rounded-2xl"
                style={{ background: "#162338" }}
              >
                <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0">
                  <ProductImage url={item.imageUrl} name={item.productName} className="h-full w-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-white truncate">{item.productName}</p>
                  <p className="text-sm truncate" style={{ color: "#6a8ab8" }}>
                    {item.variantName !== "Default" ? item.variantName : item.sku}
                  </p>
                  {(item.lineDiscount ?? 0) > 0.001 && (
                    <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--pos-success-soft, #34d399)" }}>
                      Disc −{state.currency} {formatNumber(item.lineDiscount ?? 0)}
                    </p>
                  )}
                </div>
                <div className="text-center shrink-0 w-10">
                  <p className="text-lg font-black text-white">{item.quantity}</p>
                  <p className="text-[10px]" style={{ color: "#4a6a8a" }}>qty</p>
                </div>
                <div className="text-right shrink-0 min-w-[100px]">
                  {(item.lineDiscount ?? 0) > 0.001 && (
                    <p className="text-xs line-through tabular-nums" style={{ color: "#6a8ab8" }}>
                      {state.currency} {formatNumber(item.lineGross ?? item.lineTotal)}
                    </p>
                  )}
                  <p className="text-base font-bold text-white">{state.currency} {formatNumber(item.lineTotal)}</p>
                  <p className="text-xs" style={{ color: "#6a8ab8" }}>
                    @ {formatNumber(item.unitPrice)}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="px-6 py-5 border-t shrink-0" style={{ borderColor: "#1e3356", background: "#0d1b2e" }}>
          {state.phase === "checkout" ? (
            <>
              <CheckoutCashPanel state={state} />
              <TotalsPanel state={state} compact />
            </>
          ) : (
            <TotalsPanel state={state} />
          )}
        </div>
      </div>
    </div>
  );
}

export function PosCustomerDisplayScreen() {
  const { settings: receiptSettings } = useReceiptSettings();
  const [state, setState] = React.useState<CustomerDisplayState | null>(() => readCustomerDisplayState());
  const [connected, setConnected] = React.useState(true);

  React.useEffect(() => {
    const unsub = subscribeCustomerDisplayState((next) => {
      setState(next);
      setConnected(true);
    });
    return unsub;
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => {
      if (!state?.updatedAt) return;
      setConnected(Date.now() - state.updatedAt < 15_000);
    }, 2000);
    return () => clearInterval(t);
  }, [state?.updatedAt]);

  const branding = React.useMemo(
    () => mergeDisplayBranding(state, receiptSettings),
    [state, receiptSettings],
  );

  const displayState = state;

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden select-none"
      style={{ background: "linear-gradient(160deg,#070d1a 0%,#0d1b2e 45%,#0f1f3a 100%)" }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-8 h-16 shrink-0 border-b"
        style={{ borderColor: "#1e3356", background: "rgba(15,31,58,0.85)" }}
      >
        <div className="flex items-center gap-4">
          <ShopBrandLogo logoUrl={branding.logoUrl} shopName={branding.shopName} size="sm" />
          <div>
            <p className="text-lg font-bold text-white leading-tight">{branding.shopName}</p>
            {branding.tagline && (
              <p className="text-xs" style={{ color: "#6a8ab8" }}>{branding.tagline}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: connected ? "#10b981" : "#6a8ab8" }}>
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {connected ? "Live" : "Reconnecting…"}
        </div>
      </header>

      {/* Body */}
      <main className="flex flex-1 min-h-0 flex-col">
        {!displayState || displayState.phase === "waiting" ? (
          <WaitingScreen branding={branding} />
        ) : displayState.phase === "idle" ? (
          <IdleScreen branding={branding} />
        ) : displayState.phase === "thankyou" ? (
          <ThankYouScreen state={displayState} />
        ) : (
          <ShoppingScreen state={displayState} />
        )}
      </main>

      {/* Footer clock */}
      <footer
        className="h-10 flex items-center justify-center shrink-0 border-t text-xs font-mono"
        style={{ borderColor: "#1e3356", color: "#4a6a8a" }}
      >
        <LiveClock />
      </footer>
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span>
      {now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
      {" · "}
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
    </span>
  );
}
