"use client";

import * as React from "react";
import { Loader2, RefreshCw, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";

interface SaleRow {
  id: string;
  invoiceNumber: string;
  total: number;
  invoiceDate: string;
  status: string;
  customerId?: string | null;
  customer?: { id?: string; firstName?: string; lastName?: string | null; phone?: string; name?: string } | null;
  _count?: { items: number };
}

interface SaleItemDetail {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  variant?: { product?: { warrantyMonths?: number | null } };
}

interface SaleDetail {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId?: string | null;
  customer?: SaleRow["customer"];
  items: SaleItemDetail[];
}

interface PosWarrantyPanelProps {
  /** Pre-select a sale (e.g. from Orders list). */
  initialSaleId?: string | null;
  onInitialSaleConsumed?: () => void;
}

function customerLabel(c?: SaleRow["customer"] | null): string {
  if (!c) return "Walk-in";
  if (c.name?.trim()) return c.name.trim();
  const full = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return full || c.phone || "Customer";
}

export function PosWarrantyPanel({ initialSaleId, onInitialSaleConsumed }: PosWarrantyPanelProps) {
  const [step, setStep] = React.useState<"search" | "item" | "confirm" | "done">("search");
  const [query, setQuery] = React.useState("");
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<SaleRow[]>([]);
  const [sale, setSale] = React.useState<SaleDetail | null>(null);
  const [saleLoading, setSaleLoading] = React.useState(false);
  const [selectedVariantId, setSelectedVariantId] = React.useState<string | null>(null);
  const [issueDescription, setIssueDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [claimNumber, setClaimNumber] = React.useState<string | null>(null);

  const loadSale = React.useCallback(async (row: SaleRow) => {
    setSaleLoading(true);
    try {
      const r = await api.get<SaleDetail>(`/sales/${row.id}`);
      const data = r.data;
      setSale(data);
      setSelectedVariantId(data.items[0]?.variantId ?? null);
      setStep("item");
    } catch {
      toast.error("Failed to load invoice");
    } finally {
      setSaleLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!initialSaleId) return;
    let cancelled = false;
    setSaleLoading(true);
    api
      .get<SaleDetail>(`/sales/${initialSaleId}`)
      .then((r) => {
        if (cancelled) return;
        setSale(r.data);
        setSelectedVariantId(r.data.items[0]?.variantId ?? null);
        setStep("item");
        onInitialSaleConsumed?.();
      })
      .catch(() => toast.error("Failed to load invoice for warranty"))
      .finally(() => {
        if (!cancelled) setSaleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSaleId, onInitialSaleConsumed]);

  const searchSales = async () => {
    if (!query.trim()) return;
    setSearchLoading(true);
    try {
      const r = await api.get<{ data?: SaleRow[] }>(
        `/sales?search=${encodeURIComponent(query.trim())}&limit=8`,
      );
      const rows = r.data?.data ?? [];
      setSearchResults(rows);
      if (!rows.length) toast.error("No invoices found");
    } catch {
      toast.error("Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const selectedItem = sale?.items.find((i) => i.variantId === selectedVariantId);
  const warrantyMonths = selectedItem?.variant?.product?.warrantyMonths ?? 12;
  const purchaseDate = sale?.invoiceDate
    ? new Date(sale.invoiceDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const customerId = sale?.customerId ?? sale?.customer?.id;

  const submitClaim = async () => {
    if (!sale || !selectedVariantId || !issueDescription.trim()) {
      toast.error("Select a part and describe the issue");
      return;
    }
    if (!customerId) {
      toast.error("This sale has no customer — add a customer to the invoice first, or create the claim from Warranty page");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post<{ claimNumber: string }>("/spare-parts/warranty-claims", {
        customerId,
        variantId: selectedVariantId,
        saleId: sale.id,
        warrantyMonths,
        purchaseDate,
        issueDescription: issueDescription.trim(),
      });
      setClaimNumber(r.data?.claimNumber ?? "Submitted");
      setStep("done");
      toast.success("Warranty claim submitted");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to submit claim");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep("search");
    setQuery("");
    setSearchResults([]);
    setSale(null);
    setSelectedVariantId(null);
    setIssueDescription("");
    setClaimNumber(null);
  };

  if (saleLoading && !sale) {
    return (
      <div className="flex items-center justify-center flex-1">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#4f6ef7" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5" style={{ color: "#4f6ef7" }} />
          <h2 className="text-white font-bold text-base">Warranty Claim</h2>
        </div>
        {step !== "search" && (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-semibold px-3 h-8 rounded-xl border hover:bg-white/10"
            style={{ borderColor: "#1e3356", color: "#6a8ab8" }}
          >
            New claim
          </button>
        )}
      </div>

      {step === "search" && (
        <>
          <p className="text-xs shrink-0" style={{ color: "#6a8ab8" }}>
            Find the original invoice, then select the defective part to file a warranty claim.
          </p>
          <div className="flex gap-2 shrink-0">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchSales()}
              placeholder="Invoice #, customer phone or name…"
              className="flex-1 h-10 px-3 rounded-xl text-sm text-white outline-none"
              style={{ background: "#1a2b4a", border: "1px solid #1e3356" }}
            />
            <button
              type="button"
              onClick={searchSales}
              disabled={searchLoading}
              className="flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-semibold text-white"
              style={{ background: "#4f6ef7" }}
            >
              {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </button>
          </div>
          <div className="flex-1 overflow-y-auto rounded-xl border" style={{ borderColor: "#1e3356" }}>
            {searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12" style={{ color: "#4a6a8a" }}>
                <Wrench className="h-12 w-12 mb-2 opacity-20" />
                <p className="text-sm">Search for a completed sale</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead style={{ position: "sticky", top: 0, background: "#0f1f3a" }}>
                  <tr>
                    {["Invoice", "Customer", "Total", "Date", ""].map((h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2 text-[11px] font-semibold"
                        style={{ color: "#6a8ab8", borderBottom: "1px solid #1e3356" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #1a2b3a" }}>
                      <td className="px-3 py-2 font-mono text-xs font-bold" style={{ color: "#4f6ef7" }}>
                        {row.invoiceNumber}
                      </td>
                      <td className="px-3 py-2 text-xs text-white">{customerLabel(row.customer)}</td>
                      <td className="px-3 py-2 text-xs font-mono text-white">
                        LKR {formatNumber(row.total)}
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: "#6a8ab8" }}>
                        {new Date(row.invoiceDate).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => loadSale(row)}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg text-white"
                          style={{ background: "#4f6ef7" }}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {step === "item" && sale && (
        <>
          <div
            className="rounded-xl p-3 shrink-0 border text-xs space-y-1"
            style={{ borderColor: "#1e3356", background: "#162338" }}
          >
            <p className="text-white font-semibold font-mono">{sale.invoiceNumber}</p>
            <p style={{ color: "#6a8ab8" }}>
              {customerLabel(sale.customer)} · Sold {new Date(sale.invoiceDate).toLocaleDateString()}
            </p>
            {!customerId && (
              <p className="text-amber-400 font-medium">No customer on this sale — claim cannot be submitted.</p>
            )}
          </div>
          <p className="text-xs font-semibold text-white shrink-0">Select defective part</p>
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {sale.items.map((it) => {
              const active = selectedVariantId === it.variantId;
              const wm = it.variant?.product?.warrantyMonths;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSelectedVariantId(it.variantId)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border transition-all",
                    active && "ring-2 ring-[#4f6ef7]",
                  )}
                  style={{
                    borderColor: active ? "#4f6ef7" : "#1e3356",
                    background: active ? "rgba(79,110,247,0.12)" : "#162338",
                  }}
                >
                  <p className="text-sm font-semibold text-white">
                    {it.productName} {it.variantName}
                  </p>
                  <p className="text-[11px] font-mono mt-0.5" style={{ color: "#6a8ab8" }}>
                    {it.sku} · Qty {it.quantity}
                    {wm != null ? ` · ${wm} mo warranty` : ""}
                  </p>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!selectedVariantId || !customerId}
            onClick={() => setStep("confirm")}
            className="shrink-0 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "#4f6ef7" }}
          >
            Continue
          </button>
        </>
      )}

      {step === "confirm" && sale && selectedItem && (
        <>
          <div className="rounded-xl p-3 border text-xs space-y-2 shrink-0" style={{ borderColor: "#1e3356", background: "#162338" }}>
            <p className="text-white font-semibold">{selectedItem.productName} {selectedItem.variantName}</p>
            <p style={{ color: "#6a8ab8" }}>
              Invoice {sale.invoiceNumber} · Purchase {purchaseDate} · Warranty {warrantyMonths} months
            </p>
          </div>
          <label className="text-xs font-semibold text-white shrink-0">Describe the defect / issue</label>
          <textarea
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            rows={4}
            placeholder="e.g. Alternator failed after 2 weeks, grinding noise…"
            className="flex-1 min-h-[100px] w-full p-3 rounded-xl text-sm text-white resize-none outline-none"
            style={{ background: "#1a2b4a", border: "1px solid #1e3356" }}
          />
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setStep("item")}
              className="flex-1 h-10 rounded-xl text-sm font-semibold border"
              style={{ borderColor: "#1e3356", color: "#a0b4d4" }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={submitting || !issueDescription.trim()}
              onClick={submitClaim}
              className="flex-1 h-10 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "#4f6ef7" }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Submit claim
            </button>
          </div>
        </>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(16,185,129,0.15)" }}
          >
            <Wrench className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">Claim submitted</h3>
            <p className="text-sm mt-1 font-mono" style={{ color: "#4f6ef7" }}>
              {claimNumber}
            </p>
            <p className="text-xs mt-2" style={{ color: "#6a8ab8" }}>
              Manager can approve from Warranty page or Workflows.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold text-white"
            style={{ background: "#4f6ef7" }}
          >
            <RefreshCw className="h-4 w-4" /> File another claim
          </button>
        </div>
      )}
    </div>
  );
}
