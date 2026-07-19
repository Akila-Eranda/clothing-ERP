"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Banknote, FileText, Package, Plus, Save, Search, ScanLine, Trash2, Warehouse, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useBranchStore } from "@/stores/branch-store";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────
interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  contactPerson?: string | null;
  creditDays?: number | null;
  creditLimit?: number | null;
  balance?: number | null;
  lastPurchaseDate?: string | null;
}
interface VariantOpt {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string;
  size?: string | null;
  color?: string | null;
  imageUrl?: string | null;
  sellingPrice?: number | null;
  unitPrice?: number | null;
  currentStock?: number | null;
  availableStock?: number | null;
  reservedStock?: number | null;
  minStock?: number | null;
  status?: string | null;
  leadTimeDays?: number | null;
  lastPurchaseDate?: string | null;
  lastPurchaseQty?: number | null;
  soldAfterLastPurchase?: number | null;
  lastBuyingPrice?: number | null;
  supplierId?: string | null;
  supplierProductCode?: string | null;
  category?: string | null;
  brand?: string | null;
  costPrice: number;
  taxRate?: number;
  stock: number;
}
interface LineItem {
  variantId: string; productName: string; variantName: string; sku: string;
  size?: string | null; color?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  orderedQty: number;
  unitCost: number;
  discount: number;
  taxRate: number;
}

function calcItem(i: LineItem) {
  const line    = i.unitCost * i.orderedQty;
  const taxable = line - i.discount;
  const tax     = (taxable * i.taxRate) / 100;
  return { line, taxable, tax, total: taxable + tax };
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function dash<T>(v: T | null | undefined, format?: (x: T) => string): string {
  if (v === null || v === undefined || v === "") return "—";
  return format ? format(v) : String(v);
}

const PAYMENT_TERMS = ["Immediate", "15 Days", "30 Days", "45 Days", "60 Days", "90 Days"];

function SectionCard({
  step,
  title,
  subtitle,
  children,
  action,
}: {
  step?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-card  border border-border overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b bg-background px-4 py-3.5 sm:px-5">
        <div className="flex items-start gap-3 min-w-0">
          {step ? (
            <span className="mt-0.5 h-6 min-w-6 px-1.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
              {step}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5 space-y-4">{children}</div>
    </section>
  );
}

function SidebarBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card  border border-border overflow-hidden">
      <div className="border-b bg-background px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-4 space-y-2.5">{children}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <span className="font-medium text-right text-xs truncate max-w-[160px]">{value}</span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function CreatePOPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const activeBranchName = useBranchStore((s) => s.activeBranchName);
  const adminBypass = bypassesWorkflowApproval(user?.role);

  const [suppliers,    setSuppliers]    = useState<Supplier[]>([]);
  const [allVariants,  setAllVariants]  = useState<VariantOpt[]>([]);
  const [supplierId,   setSupplierId]   = useState("");
  const [supplier,     setSupplier]     = useState<Supplier | null>(null);
  const [expectedDate, setExpectedDate] = useState("");
  const [reference,    setReference]    = useState("");
  const [paymentTerms, setPaymentTerms] = useState("30 Days");
  const [notes,        setNotes]        = useState("");
  const [items,        setItems]        = useState<LineItem[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [fromGrnId, setFromGrnId] = useState<string | null>(null);
  const [fromGrnNumber, setFromGrnNumber] = useState<string | null>(null);
  const [grnPrefillLoading, setGrnPrefillLoading] = useState(false);
  const [loadingSupplierDetail, setLoadingSupplierDetail] = useState(false);
  const [payNow, setPayNow] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payAmountTouched, setPayAmountTouched] = useState(false);
  const [payMethod, setPayMethod] = useState("CASH");
  const [payReference, setPayReference] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [chequeBankName, setChequeBankName] = useState("");

  const [searchQ,      setSearchQ]      = useState<string[]>([]);
  const [searchOpen,   setSearchOpen]   = useState<number | null>(null);

  const [productSearchQ, setProductSearchQ] = useState("");
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(0);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);

  const productSearchRef = useRef<HTMLInputElement>(null);
  const qtyInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const costInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const supplierSelectRef = useRef<HTMLSelectElement>(null);
  const supplierDetailReqRef = useRef(0);

  const catalogReqRef = useRef(0);

  const loadSupplierCatalog = useCallback(async (sid: string) => {
    if (!sid) {
      setAllVariants([]);
      return;
    }
    const reqId = ++catalogReqRef.current;
    setLoadingProducts(true);
    setAllVariants([]);
    try {
      const res = await api.get<VariantOpt[]>(
        `/pos/products?supplierId=${encodeURIComponent(sid)}&limit=2000`,
      );
      if (reqId !== catalogReqRef.current) return;
      const rows = Array.isArray(res.data) ? res.data : [];
      // Strict: only this supplier's assigned catalog (never widen to all products)
      setAllVariants(
        rows
          .filter((v) => !v.supplierId || v.supplierId === sid)
          .map((v) => ({ ...v, supplierId: sid })),
      );
    } catch {
      if (reqId !== catalogReqRef.current) return;
      setAllVariants([]);
      toast.error("Failed to load supplier products");
    } finally {
      if (reqId === catalogReqRef.current) setLoadingProducts(false);
    }
  }, []);

  const mapSupplierDetail = useCallback((raw: Record<string, unknown> | Supplier | null | undefined): Supplier | null => {
    if (!raw || typeof raw !== "object" || !("id" in raw) || !raw.id) return null;
    const s = raw as Supplier & {
      outstandingBalance?: number | null;
      lastPurchaseDate?: string | null;
      purchases?: { orderDate?: string; createdAt?: string }[];
    };
    const lastPo = s.purchases?.[0];
    const lastPurchaseDate =
      s.lastPurchaseDate
      ?? lastPo?.orderDate
      ?? lastPo?.createdAt
      ?? null;
    return {
      id: String(s.id),
      name: s.name ?? "Supplier",
      phone: s.phone ?? null,
      email: s.email ?? null,
      address: s.address ?? null,
      city: s.city ?? null,
      contactPerson: s.contactPerson ?? null,
      creditDays: s.creditDays ?? null,
      creditLimit: s.creditLimit ?? null,
      balance: s.outstandingBalance ?? s.balance ?? null,
      lastPurchaseDate,
    };
  }, []);

  const loadSupplierDetail = useCallback(async (sid: string) => {
    if (!sid) return;
    const reqId = ++supplierDetailReqRef.current;
    setLoadingSupplierDetail(true);
    try {
      const res = await api.get<Supplier & {
        creditDays?: number;
        creditLimit?: number;
        balance?: number;
        outstandingBalance?: number;
        lastPurchaseDate?: string | null;
        purchases?: { orderDate?: string; createdAt?: string }[];
      }>(`/suppliers/${sid}`);
      if (reqId !== supplierDetailReqRef.current) return;
      const mapped = mapSupplierDetail(res.data as Supplier);
      if (mapped) setSupplier(mapped);
    } catch (e: unknown) {
      if (reqId !== supplierDetailReqRef.current) return;
      toast.error((e as Error)?.message || "Failed to load supplier details");
    } finally {
      if (reqId === supplierDetailReqRef.current) {
        setLoadingSupplierDetail(false);
      }
    }
  }, [mapSupplierDetail]);

  useEffect(() => {
    api.get<{ data: Supplier[] }>("/suppliers?limit=200").then((r) =>
      setSuppliers(r.data?.data ?? (r.data as unknown as Supplier[]) ?? [])
    ).catch(() => {});
  }, []);

  const handleSupplierChange = useCallback((id: string) => {
    setSupplierId(id);
    const fromList = suppliers.find((s) => s.id === id) ?? null;
    // Optimistic list row — detail effect below replaces with full credit / last-PO data
    setSupplier(fromList ? mapSupplierDetail(fromList) : null);
    setProductSearchQ("");
    setProductSearchOpen(false);
    setSearchHighlight(0);
    setSearchOpen(null);
    setSelectedRowIdx(null);
    // Switching supplier resets lines so other-supplier products cannot remain
    if (!fromGrnId) {
      setItems([]);
      setSearchQ([]);
    }
    if (id) {
      void loadSupplierCatalog(id);
      window.setTimeout(() => productSearchRef.current?.focus(), 50);
    } else {
      catalogReqRef.current += 1;
      setAllVariants([]);
      setLoadingProducts(false);
      supplierDetailReqRef.current += 1;
      setLoadingSupplierDetail(false);
    }
  }, [suppliers, loadSupplierCatalog, mapSupplierDetail, fromGrnId]);

  // Always fetch full supplier summary when selection changes
  useEffect(() => {
    if (!supplierId) return;
    void loadSupplierDetail(supplierId);
  }, [supplierId, loadSupplierDetail]);

  // Prefill supplier from ?supplier=
  useEffect(() => {
    const prefill = searchParams.get("supplier");
    if (prefill && suppliers.length && suppliers.some((s) => s.id === prefill) && supplierId !== prefill) {
      handleSupplierChange(prefill);
    }
  }, [searchParams, suppliers, handleSupplierChange, supplierId]);

  // Prefill entire form from Quick/Direct GRN (?fromGrn=)
  useEffect(() => {
    const grnId = searchParams.get("fromGrn");
    if (!grnId) return;
    let cancelled = false;
    setGrnPrefillLoading(true);
    api
      .get<{
        id: string;
        grnNumber: string;
        notes?: string | null;
        supplierInvoiceRef?: string | null;
        purchase?: { id: string; poNumber: string } | null;
        supplier: { id: string; name?: string };
        items: {
          variantId: string;
          productName: string;
          variantName: string;
          sku: string;
          receivedQty: number;
          unitCost: number;
        }[];
      }>(`/procurement/grn/${grnId}`)
      .then((r) => {
        if (cancelled) return;
        const g = r.data;
        if (g.purchase?.id) {
          toast.info(`This GRN is already linked to ${g.purchase.poNumber}`);
          router.replace(`/purchases/${g.purchase.id}`);
          return;
        }
        setFromGrnId(g.id);
        setFromGrnNumber(g.grnNumber);
        setSupplierId(g.supplier.id);
        setSupplier({ id: g.supplier.id, name: g.supplier.name ?? "Supplier" });
        setReference(g.supplierInvoiceRef || g.grnNumber);
        setNotes(
          g.notes
            ? `${g.notes}\n(Created from ${g.grnNumber} — stock already received)`
            : `Created from ${g.grnNumber} — stock already received by cashier`,
        );
        setPaymentTerms("Immediate");
        setExpectedDate(new Date().toISOString().slice(0, 10));
        const lines = g.items
          .filter((i) => i.receivedQty > 0)
          .map((i) => ({
            variantId: i.variantId,
            productName: i.productName,
            variantName: i.variantName,
            sku: i.sku,
            orderedQty: i.receivedQty,
            unitCost: i.unitCost,
            discount: 0,
            taxRate: 0,
          }));
        setItems(lines);
        setSearchQ(lines.map(() => ""));
        // supplierId change triggers loadSupplierDetail via effect
        void loadSupplierCatalog(g.supplier.id);
        toast.success(`Loaded ${g.grnNumber} — review & create PO`);
      })
      .catch((e: unknown) => {
        if (!cancelled) toast.error((e as Error).message ?? "Failed to load GRN");
      })
      .finally(() => {
        if (!cancelled) setGrnPrefillLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, router, loadSupplierCatalog]);

  const variantById = useMemo(() => {
    return new Map(allVariants.map((v) => [v.variantId, v]));
  }, [allVariants]);

  // ── Items logic ────────────────────────────────────────────────────────
  const addRow = () => {
    setItems((p) => [
      ...p,
      {
        variantId: "",
        productName: "",
        variantName: "",
        sku: "",
        size: undefined,
        color: undefined,
        barcode: undefined,
        imageUrl: undefined,
        orderedQty: 1,
        unitCost: 0,
        discount: 0,
        taxRate: 0,
      },
    ]);
    setSearchQ((p) => [...p, ""]);
    setSearchOpen(items.length);
  };

  const removeRow = (idx: number) => {
    setItems((p) => p.filter((_, i) => i !== idx));
    setSearchQ((p) => p.filter((_, i) => i !== idx));
    setSearchOpen(null);
    setSelectedRowIdx((cur) => {
      if (cur === null) return cur;
      if (cur === idx) return null;
      if (cur > idx) return cur - 1;
      return cur;
    });
  };

  const updateItem = <K extends keyof LineItem>(idx: number, key: K, val: LineItem[K]) => {
    setItems((p) => p.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  };

  const selectVariant = (idx: number, v: VariantOpt) => {
    setItems((p) => p.map((it, i) => i === idx ? {
      ...it, variantId: v.variantId, productName: v.productName,
      variantName: v.variantName,
      sku: v.sku,
      size: v.size ?? undefined,
      color: v.color ?? undefined,
      barcode: v.barcode ?? undefined,
      imageUrl: v.imageUrl ?? undefined,
      unitCost: v.costPrice,
      taxRate: v.taxRate ?? 0,
    } : it));
    setSearchQ((p) => p.map((q, i) => i === idx ? "" : q));
    setSearchOpen(null);
  };

  const clearVariant = (idx: number) => {
    setItems((p) => p.map((it, i) => i === idx ? {
      variantId: "", productName: "", variantName: "", sku: "",
      size: undefined,
      color: undefined,
      barcode: undefined,
      imageUrl: undefined,
      orderedQty: it.orderedQty,
      unitCost: 0,
      discount: it.discount,
      taxRate: 0,
    } : it));
    setSearchQ((p) => p.map((q, i) => i === idx ? "" : q));
    setSearchOpen(idx);
  };

  const filteredVariants = (q: string) => {
    if (!supplierId) return [];
    // Catalog is loaded only for the selected supplier — search within that set only
    const scoped = allVariants.filter((v) => v.supplierId === supplierId);
    if (!q.trim()) return scoped.slice(0, 40);
    const lq = q.trim().toLowerCase();
    return scoped
      .filter((v) =>
        v.productName.toLowerCase().includes(lq)
        || v.sku.toLowerCase().includes(lq)
        || v.variantName.toLowerCase().includes(lq)
        || (v.barcode?.toLowerCase().includes(lq) ?? false)
        || (v.supplierProductCode?.toLowerCase().includes(lq) ?? false)
        || (v.category?.toLowerCase().includes(lq) ?? false)
        || (v.brand?.toLowerCase().includes(lq) ?? false)
      )
      .slice(0, 25);
  };

  const resolveVariantByCode = async (code: string): Promise<VariantOpt | null> => {
    const trimmed = code.trim();
    if (!trimmed || !supplierId) return null;
    // Prefer in-catalog match only (already supplier-scoped)
    const local = allVariants.find((v) =>
      v.supplierId === supplierId
      && (
        v.sku.toLowerCase() === trimmed.toLowerCase()
        || v.barcode?.toLowerCase() === trimmed.toLowerCase()
        || v.supplierProductCode?.toLowerCase() === trimmed.toLowerCase()
      )
    );
    if (local) return local;
    try {
      const res = await api.get<{
        variantId: string; productName: string; variantName: string; sku: string;
        barcode?: string;
        costPrice: number;
        stock: number;
        size?: string;
        color?: string;
        imageUrl?: string | null;
        brand?: string | null;
        category?: string | null;
        sellingPrice?: number | null;
        currentStock?: number | null;
        availableStock?: number | null;
        reservedStock?: number | null;
        leadTimeDays?: number | null;
        lastPurchaseDate?: string | null;
        lastPurchaseQty?: number | null;
        soldAfterLastPurchase?: number | null;
        lastBuyingPrice?: number | null;
        supplierId?: string | null;
        supplierProductCode?: string | null;
        supplierAssigned?: boolean;
      }>(`/pos/barcode/${encodeURIComponent(trimmed)}?supplierId=${encodeURIComponent(supplierId)}`);
      const d = res.data;
      if (!d?.variantId || d.supplierId !== supplierId) return null;
      return {
        variantId: d.variantId,
        productName: d.productName,
        variantName: d.variantName,
        sku: d.sku,
        barcode: d.barcode,
        costPrice: d.costPrice,
        stock: d.stock,
        size: d.size,
        color: d.color,
        imageUrl: d.imageUrl ?? undefined,
        brand: d.brand ?? undefined,
        category: d.category ?? undefined,
        sellingPrice: d.sellingPrice ?? undefined,
        currentStock: d.currentStock ?? undefined,
        availableStock: d.availableStock ?? undefined,
        reservedStock: d.reservedStock ?? undefined,
        leadTimeDays: d.leadTimeDays ?? undefined,
        lastPurchaseDate: d.lastPurchaseDate ?? undefined,
        lastPurchaseQty: d.lastPurchaseQty ?? undefined,
        soldAfterLastPurchase: d.soldAfterLastPurchase ?? undefined,
        lastBuyingPrice: d.lastBuyingPrice ?? undefined,
        supplierId,
        supplierProductCode: d.supplierProductCode ?? undefined,
      };
    } catch {
      return null;
    }
  };

  const handleItemSearchKeyDown = async (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setSearchOpen(null);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = (searchQ[idx] ?? "").trim();
    if (!q) return;

    const matches = filteredVariants(q);
    if (matches.length === 1) {
      selectVariant(idx, matches[0]);
      return;
    }
    if (matches.length > 1) {
      selectVariant(idx, matches[0]);
      return;
    }

    const resolved = await resolveVariantByCode(q);
    if (resolved) {
      if (!resolved.supplierId || resolved.supplierId !== supplierId) {
        toast.error("Product is not assigned to this supplier — assign it on the product or supplier page first");
        return;
      }
      selectVariant(idx, resolved);
      toast.success(`Added ${resolved.productName}`);
    } else {
      toast.error(`Product not found or not assigned to this supplier: ${q}`);
    }
  };

  const addVariantToItems = (v: VariantOpt) => {
    if (!supplierId) {
      toast.error("Select a supplier first");
      return;
    }
    if (v.supplierId && v.supplierId !== supplierId) {
      toast.error("Product is not assigned to this supplier");
      return;
    }
    const existingIdx = items.findIndex((i) => i.variantId === v.variantId);
    if (existingIdx >= 0) {
      setItems((p) => p.map((it, i) => i === existingIdx ? { ...it, orderedQty: it.orderedQty + 1 } : it));
      setSelectedRowIdx(existingIdx);
      setProductSearchOpen(false);
      setProductSearchQ("");
      window.setTimeout(() => qtyInputRefs.current[existingIdx]?.focus(), 30);
      toast.message("Qty increased for existing line");
      return;
    }

    const newIdx = items.length;
    setItems((p) => [
      ...p,
      {
        variantId: v.variantId,
        productName: v.productName,
        variantName: v.variantName,
        sku: v.sku,
        size: v.size ?? undefined,
        color: v.color ?? undefined,
        barcode: v.barcode ?? undefined,
        imageUrl: v.imageUrl ?? undefined,
        orderedQty: 1,
        unitCost: v.lastBuyingPrice ?? v.costPrice,
        discount: 0,
        taxRate: v.taxRate ?? 0,
      },
    ]);
    setSearchQ((p) => [...p, ""]);
    setSearchOpen(null);
    setSelectedRowIdx(newIdx);
    setProductSearchOpen(false);
    setProductSearchQ("");
    setSearchHighlight(0);
    window.setTimeout(() => qtyInputRefs.current[newIdx]?.focus(), 40);
  };

  const handleBigSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setProductSearchOpen(false);
      setSearchHighlight(0);
      return;
    }

    const matches = filteredVariants(productSearchQ);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setProductSearchOpen(true);
      setSearchHighlight((h) => Math.min(h + 1, Math.max(matches.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchHighlight((h) => Math.max(h - 1, 0));
      return;
    }

    if (e.key !== "Enter") return;
    e.preventDefault();

    if (!supplierId) {
      toast.error("Select a supplier first");
      supplierSelectRef.current?.focus();
      return;
    }

    const q = (productSearchQ ?? "").trim();
    if (!q) return;

    if (matches.length) {
      const pick = matches[Math.min(searchHighlight, matches.length - 1)] ?? matches[0];
      addVariantToItems(pick);
      return;
    }

    const resolved = await resolveVariantByCode(q);
    if (resolved) {
      if (!resolved.supplierId || resolved.supplierId !== supplierId) {
        toast.error("Product is not assigned to this supplier — assign it on the product or supplier page first");
        return;
      }
      toast.success(`Added ${resolved.productName}`);
      addVariantToItems(resolved);
    } else {
      toast.error(`Product not found or not assigned to this supplier: ${q}`);
    }
  };

  // ── Summary ────────────────────────────────────────────────────────────
  const subtotal  = items.reduce((s, i) => s + i.unitCost * i.orderedQty, 0);
  const totalDisc = items.reduce((s, i) => s + i.discount, 0);
  const totalTax  = items.reduce((s, i) => s + calcItem(i).tax, 0);
  const grandTotal = subtotal - totalDisc + totalTax;
  const totalQty   = items.reduce((s, i) => s + i.orderedQty, 0);

  useEffect(() => {
    if (payNow && !payAmountTouched) {
      setPayAmount(grandTotal > 0 ? grandTotal.toFixed(2) : "");
    }
  }, [payNow, payAmountTouched, grandTotal]);

  // ── Submit ─────────────────────────────────────────────────────────────
  const submit = async (submitForApproval: boolean) => {
    if (!supplierId) { toast.error("Please select a supplier"); return; }
    if (!items.length) { toast.error("Add at least one product"); return; }
    if (items.some((i) => !i.variantId)) { toast.error("All rows must have a product selected"); return; }
    if (items.some((i) => !i.orderedQty || i.orderedQty <= 0)) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    if (items.some((i) => i.unitCost === null || i.unitCost === undefined || Number.isNaN(i.unitCost))) {
      toast.error("Buying price is required on all lines");
      return;
    }
    if (payNow) {
      const amt = parseFloat(payAmount);
      if (!(amt > 0)) {
        toast.error("Enter payment amount");
        return;
      }
      if (amt > grandTotal + 0.01) {
        toast.error("Payment cannot exceed PO total");
        return;
      }
      if (payMethod === "CHEQUE" && !chequeNumber.trim()) {
        toast.error("Cheque number is required");
        return;
      }
      if (payMethod === "CHEQUE" && !chequeDueDate.trim()) {
        toast.error("Cheque due date is required");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        supplierId, expectedDate: expectedDate || undefined,
        notes: notes || undefined, reference: reference || undefined, paymentTerms,
        fromGrnId: fromGrnId || undefined,
        items: items.map((i) => ({
          variantId: i.variantId, productName: i.productName, variantName: i.variantName,
          sku: i.sku, orderedQty: i.orderedQty, unitCost: i.unitCost,
          discount: i.discount, taxRate: i.taxRate,
        })),
        ...(payNow
          ? {
              payment: {
                amount: parseFloat(payAmount),
                method: payMethod,
                reference: payReference.trim() || undefined,
                notes: "Paid on PO create",
                ...(payMethod === "CHEQUE"
                  ? {
                      chequeNumber: chequeNumber.trim(),
                      chequeDueDate: chequeDueDate || undefined,
                      chequeBankName: chequeBankName.trim() || undefined,
                    }
                  : {}),
              },
            }
          : {}),
      };
      const res = await api.post<{ id: string }>("/purchases", payload);
      if (fromGrnId) {
        toast.success(
          fromGrnNumber
            ? `PO created & linked to ${fromGrnNumber}${payNow ? " · supplier paid" : " (already received)"}`
            : `PO created and linked to GRN${payNow ? " · supplier paid" : ""}`,
        );
      } else if (submitForApproval) {
        await api.post(`/purchases/${res.data.id}/submit-approval`);
        toast.success(
          adminBypass
            ? `Purchase order created and confirmed${payNow ? " · supplier paid" : ""}`
            : `Purchase order submitted for approval${payNow ? " · supplier paid" : ""}`,
        );
      } else {
        toast.success(`Purchase order saved as draft${payNow ? " · supplier paid" : ""}`);
      }
      router.push(`/purchases/${res.data.id}`);
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to create PO"); }
    finally { setSaving(false); }
  };

  const fmt = fmtMoney;

  const selectedItem = selectedRowIdx !== null ? items[selectedRowIdx] : null;
  const selectedVariant = selectedItem ? variantById.get(selectedItem.variantId) : undefined;
  const bigMatches = productSearchOpen ? filteredVariants(productSearchQ) : [];
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-background pb-32 sm:pb-28">
      {/* Header — same layout as New Product (grocery master) */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/purchases")}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Purchases</span>
          <span className="sm:hidden">Back</span>
        </button>
        <div className="text-center min-w-0">
          <h1 className="text-base font-semibold text-foreground truncate">
            {fromGrnId ? "Create PO from GRN" : "New Purchase Order"}
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {fromGrnId && fromGrnNumber
              ? `From ${fromGrnNumber}`
              : activeBranchName
                ? `${activeBranchName} · Draft`
                : "Purchase order master"}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 h-9 shrink-0"
          disabled={saving || !supplierId || items.length === 0 || grnPrefillLoading}
          onClick={() => submit(fromGrnId ? false : true)}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{fromGrnId ? "Create" : "Save"}</span>
        </Button>
      </div>

      <div className="mx-auto w-full space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-6">
        {grnPrefillLoading && (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Loading GRN details…</div>
        )}
        {fromGrnId && fromGrnNumber && !grnPrefillLoading && (
          <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                Stock already posted
              </p>
              <p className="mt-0.5 text-sm">
                Creating PO from <span className="font-mono font-bold">{fromGrnNumber}</span> — no second stock add.
              </p>
            </div>
            <span className="w-fit shrink-0 rounded-full border bg-background/80 px-2.5 py-1 font-mono text-xs">
              {fromGrnNumber}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-5">
          <div className="min-w-0 space-y-4 sm:space-y-5">
            <SectionCard step="1" title="Supplier Information" subtitle="Who you are ordering from">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <label className="text-xs font-medium text-muted-foreground">Supplier *</label>
                  <select
                    ref={supplierSelectRef}
                    value={supplierId}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Choose a supplier…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Expected Delivery</label>
                  <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Reference Number</label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="REF-…" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Currency</label>
                  <Input value="LKR" disabled className="h-10 bg-muted/40" />
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Internal notes for this PO…"
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {supplier ? (
                <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-3 lg:grid-cols-4">
                  {[
                    ["Supplier Name", supplier.name],
                    ["Phone", dash(supplier.phone)],
                    ["Email", dash(supplier.email)],
                    ["Credit Period", supplier.creditDays != null ? `${supplier.creditDays} days` : "—"],
                    ["Outstanding", supplier.balance != null ? `LKR ${fmt(supplier.balance)}` : "—"],
                    ["Credit Limit", supplier.creditLimit != null ? `LKR ${fmt(supplier.creditLimit)}` : "—"],
                    ["Last Purchase", loadingSupplierDetail && !supplier.lastPurchaseDate ? "Loading…" : fmtDate(supplier.lastPurchaseDate)],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-lg border bg-background/80 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              ) : supplierId && loadingSupplierDetail ? (
                <p className="text-xs text-muted-foreground">Loading supplier details…</p>
              ) : null}
            </SectionCard>

            <SectionCard
              step="2"
              title="Purchase Items"
              subtitle={supplierId ? (loadingProducts ? "Loading supplier catalog…" : `${allVariants.length} products available for this supplier`) : "Select a supplier to search products"}
              action={
                <Button size="sm" onClick={addRow} disabled={saving || !supplierId} className="gap-1.5 h-8">
                  <Plus className="h-3.5 w-3.5" /> Add row
                </Button>
              }
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <ScanLine className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  ref={productSearchRef}
                  value={productSearchQ}
                  disabled={!supplierId || loadingProducts}
                  onChange={(e) => {
                    setProductSearchQ(e.target.value);
                    setProductSearchOpen(true);
                    setSearchHighlight(0);
                  }}
                  onFocus={() => setProductSearchOpen(true)}
                  onKeyDown={handleBigSearchKeyDown}
                  placeholder={supplierId ? "Search name, SKU, barcode, supplier code… Enter to add" : "Select supplier first"}
                  className="h-12 w-full rounded-xl border bg-background pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                />
                {productSearchOpen && supplierId && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-background shadow-xl">
                    <div className="max-h-80 overflow-y-auto">
                      {bigMatches.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                          {productSearchQ.trim() ? "No match — press Enter to scan barcode/SKU" : "Type to search supplier products"}
                        </p>
                      ) : (
                        bigMatches.map((v, i) => (
                          <button
                            key={v.variantId}
                            type="button"
                            onClick={() => addVariantToItems(v)}
                            className={cn(
                              "flex w-full items-start gap-3 border-b px-3 py-2.5 text-left last:border-0 sm:px-4",
                              i === searchHighlight ? "bg-primary/10" : "hover:bg-muted/50",
                            )}
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
                              {v.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.imageUrl} alt={v.productName} className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-4 w-4 text-muted-foreground/60" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{v.productName}</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {dash(v.brand)} · {dash(v.category)}
                                {v.variantName ? ` · ${v.variantName}` : ""}
                              </p>
                              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                                SKU {v.sku}
                                {v.barcode ? ` · ${v.barcode}` : ""}
                                {v.supplierProductCode ? ` · SPC ${v.supplierProductCode}` : ""}
                              </p>
                            </div>
                            <div className="shrink-0 text-right text-[11px]">
                              <p className="font-semibold tabular-nums">LKR {fmt(v.lastBuyingPrice ?? v.costPrice)}</p>
                              <p className="text-muted-foreground tabular-nums">Stock {v.stock}</p>
                              <p className="text-muted-foreground">{fmtDate(v.lastPurchaseDate)}</p>
                              <p className="text-muted-foreground">Last qty {dash(v.lastPurchaseQty)}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile / tablet cards */}
              <div className="divide-y lg:hidden">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-muted-foreground">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                      <Package className="h-6 w-6 opacity-40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No items yet</p>
                      <p className="mt-1 text-xs">Search above or add a blank row</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={addRow} disabled={saving} className="mt-1 gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add first item
                    </Button>
                  </div>
                ) : (
                  items.map((item, idx) => {
                    const v = item.variantId ? variantById.get(item.variantId) : undefined;
                    const { total } = calcItem(item);
                    const q = searchQ[idx] ?? "";
                    const matches = searchOpen === idx ? filteredVariants(q) : [];
                    const stock = v?.stock ?? null;
                    const selected = selectedRowIdx === idx;

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedRowIdx(idx)}
                        className={`space-y-3 p-3 sm:p-4 ${selected ? "bg-primary/5" : ""}`}
                      >
                        {item.variantId ? (
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background">
                              {item.imageUrl || v?.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.imageUrl || v?.imageUrl || ""} alt={item.productName} className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-5 w-5 text-muted-foreground/60" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug">{item.productName}</p>
                              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                {item.sku}{item.variantName ? ` · ${item.variantName}` : ""}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Stock {stock ?? "—"}
                                {item.size ? ` · ${item.size}` : ""}
                                {item.color ? ` · ${item.color}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); clearVariant(idx); }}
                                className="text-[11px] font-semibold text-primary hover:underline"
                              >
                                Change
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeRow(idx); }}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label="Remove row"
                                disabled={saving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                              value={q}
                              onChange={(e) => setSearchQ((p) => p.map((x, i) => (i === idx ? e.target.value : x)))}
                              onFocus={() => setSearchOpen(idx)}
                              onKeyDown={(e) => handleItemSearchKeyDown(idx, e)}
                              placeholder="Search or scan…"
                              className="h-10 w-full rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {searchOpen === idx && (
                              <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-background shadow-xl">
                                <div className="max-h-48 overflow-y-auto">
                                  {matches.length === 0 ? (
                                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                                      {q ? "No match — press Enter" : "Type to search"}
                                    </p>
                                  ) : matches.map((vv) => (
                                    <button
                                      key={vv.variantId}
                                      type="button"
                                      onClick={() => selectVariant(idx, vv)}
                                      className="flex w-full items-center justify-between gap-2 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{vv.productName}</p>
                                        <p className="truncate text-xs text-muted-foreground">{vv.sku} · {vv.variantName}</p>
                                      </div>
                                      <span className="shrink-0 text-xs font-semibold tabular-nums">LKR {vv.costPrice.toLocaleString()}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Qty</label>
                            <input
                              type="number"
                              min={1}
                              value={item.orderedQty}
                              onChange={(e) => updateItem(idx, "orderedQty", Math.max(1, parseInt(e.target.value, 10) || 1))}
                              className="h-9 w-full rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Cost</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.unitCost}
                              onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)}
                              className="h-9 w-full rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Discount</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                              className="h-9 w-full rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Tax %</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={item.taxRate}
                              onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)}
                              className="h-9 w-full rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t pt-2 text-sm">
                          <span className="text-xs text-muted-foreground">Line total</span>
                          <span className="font-bold tabular-nums text-primary">LKR {fmt(total)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto lg:block -mx-4 sm:-mx-5 border-t">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left font-semibold">Product</th>
                      <th className="px-3 py-3 text-right font-semibold">Stock</th>
                      <th className="px-3 py-3 text-right font-semibold">Last PO</th>
                      <th className="px-3 py-3 text-right font-semibold">Last Qty</th>
                      <th className="px-3 py-3 text-right font-semibold">Sold After</th>
                      <th className="px-3 py-3 text-right font-semibold">Order Qty</th>
                      <th className="px-3 py-3 text-right font-semibold">Buying</th>
                      <th className="px-3 py-3 text-right font-semibold">Discount</th>
                      <th className="px-3 py-3 text-right font-semibold">Tax</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                      <th className="w-12 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => {
                      const v = item.variantId ? variantById.get(item.variantId) : undefined;
                      const { total } = calcItem(item);
                      const q = searchQ[idx] ?? "";
                      const matches = searchOpen === idx ? filteredVariants(q) : [];
                      const stock = v?.stock ?? null;
                      const status = v?.status ?? (stock !== null ? (stock <= 0 ? "out_of_stock" : stock < 5 ? "low_stock" : "in_stock") : "unknown");
                      const statusPill =
                        status === "in_stock"
                          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                          : status === "low_stock"
                            ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-700 border-rose-500/20";

                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedRowIdx(idx)}
                          className={`cursor-pointer align-top transition-colors hover:bg-muted/15 ${
                            selectedRowIdx === idx ? "bg-primary/5 ring-1 ring-inset ring-primary/25" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            {item.variantId ? (
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
                                  {item.imageUrl || v?.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl || v?.imageUrl || ""} alt={item.productName} className="h-full w-full object-cover" />
                                  ) : (
                                    <Package className="h-4 w-4 text-muted-foreground/60" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{item.productName}</p>
                                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                    {item.sku}{item.variantName ? ` · ${item.variantName}` : ""}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {status !== "unknown" && (
                                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusPill}`}>
                                        {status.replaceAll("_", " ")}
                                      </span>
                                    )}
                                    {(item.size || item.color) && (
                                      <span className="rounded-full border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        {[item.size, item.color].filter(Boolean).join(" · ")}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); clearVariant(idx); }}
                                  className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  value={q}
                                  onChange={(e) => setSearchQ((p) => p.map((x, i) => (i === idx ? e.target.value : x)))}
                                  onFocus={() => setSearchOpen(idx)}
                                  onKeyDown={(e) => handleItemSearchKeyDown(idx, e)}
                                  placeholder="Search name, SKU, or scan…"
                                  className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                {searchOpen === idx && (
                                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-background shadow-xl">
                                    <div className="max-h-52 overflow-y-auto">
                                      {matches.length === 0 ? (
                                        <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                                          {q ? "No match — press Enter" : "Type to search"}
                                        </p>
                                      ) : matches.map((vv) => (
                                        <button
                                          key={vv.variantId}
                                          type="button"
                                          onClick={() => selectVariant(idx, vv)}
                                          className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{vv.productName}</p>
                                            <p className="truncate text-xs text-muted-foreground">{vv.sku} · {vv.variantName}</p>
                                          </div>
                                          <div className="shrink-0 text-right">
                                            <p className="text-xs font-semibold tabular-nums">LKR {vv.costPrice.toLocaleString()}</p>
                                            <p className="text-[10px] tabular-nums text-muted-foreground">Stock {vv.stock}</p>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">{stock ?? "—"}</td>
                          <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">{fmtDate(v?.lastPurchaseDate)}</td>
                          <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">{dash(v?.lastPurchaseQty)}</td>
                          <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">{dash(v?.soldAfterLastPurchase)}</td>
                          <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={(el) => { qtyInputRefs.current[idx] = el; }}
                              type="number"
                              min={1}
                              value={item.orderedQty}
                              onChange={(e) => updateItem(idx, "orderedQty", Math.max(1, parseInt(e.target.value, 10) || 1))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  costInputRefs.current[idx]?.focus();
                                }
                              }}
                              className="h-9 w-[4.5rem] rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={(el) => { costInputRefs.current[idx] = el; }}
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.unitCost}
                              onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  productSearchRef.current?.focus();
                                  setProductSearchOpen(true);
                                }
                              }}
                              className="h-9 w-24 rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                              className="h-9 w-20 rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={item.taxRate}
                              onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)}
                              className="h-9 w-16 rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums text-primary whitespace-nowrap">{fmt(total)}</td>
                          <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => removeRow(idx)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Remove row"
                              disabled={saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {items.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                              <Package className="h-6 w-6 opacity-40" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">No items yet</p>
                              <p className="mt-1 text-xs">Use search above or add a row</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={addRow} disabled={saving} className="mt-1 gap-1.5">
                              <Plus className="h-3.5 w-3.5" /> Add first item
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {items.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10 px-4 py-3 text-sm sm:px-5">
                  <span className="text-xs text-muted-foreground sm:text-sm">
                    {items.length} line{items.length === 1 ? "" : "s"} · {totalQty} units
                  </span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
                    <span className="tabular-nums text-muted-foreground">Sub <strong className="text-foreground">LKR {fmt(subtotal)}</strong></span>
                    {totalDisc > 0 && (
                      <span className="tabular-nums text-emerald-600">Disc −LKR {fmt(totalDisc)}</span>
                    )}
                    <span className="font-bold tabular-nums text-primary">Total LKR {fmt(grandTotal)}</span>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              step="3"
              title="Supplier payment"
              subtitle="Optional — record advance / pay now when creating this PO"
            >
              <div className="rounded-xl border p-4 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={payNow}
                      onChange={(e) => {
                        setPayNow(e.target.checked);
                        if (!e.target.checked) setPayAmountTouched(false);
                      }}
                      className="h-4 w-4 rounded border-border"
                    />
                    <Banknote className="h-4 w-4 text-emerald-600" />
                    Pay supplier now
                  </label>
                  <span className="text-xs text-muted-foreground">
                    PO total:{" "}
                    <span className="font-bold text-foreground">
                      LKR {fmtMoney(grandTotal)}
                    </span>
                  </span>
                </div>
                {payNow && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Amount (LKR)</label>
                      <Input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={payAmount}
                        onChange={(e) => {
                          setPayAmountTouched(true);
                          setPayAmount(e.target.value);
                        }}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Method</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      >
                        <option value="CASH">Cash</option>
                        <option value="CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank</option>
                        <option value="CHEQUE">Cheque</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Reference</label>
                      <Input
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                        placeholder="Optional"
                        className="h-9"
                      />
                    </div>
                    {payMethod === "CHEQUE" && (
                      <>
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Cheque # *</label>
                          <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="h-9 font-mono" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Due date *</label>
                          <Input type="date" value={chequeDueDate} onChange={(e) => setChequeDueDate(e.target.value)} className="h-9" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Bank</label>
                          <Input value={chequeBankName} onChange={(e) => setChequeBankName(e.target.value)} className="h-9" />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Selected details — mobile/tablet only (sidebar on xl) */}
            <section className="space-y-3 rounded-xl bg-card p-4  border border-border xl:hidden sm:p-5">
              <div>
                <h2 className="text-sm font-semibold">Selected product</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Tap a row to see stock context</p>
              </div>
              {!selectedItem ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No row selected
                </p>
              ) : (
                <SelectedProductPanel item={selectedItem} variant={selectedVariant} supplierName={supplier?.name} />
              )}
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24">
            <SidebarBlock title="Summary">
              <MetaRow label="Products" value={items.length} />
              <MetaRow label="Total Quantity" value={totalQty} />
              <MetaRow label="Subtotal" value={`LKR ${fmt(subtotal)}`} />
              <MetaRow label="Discount" value={<span className="text-emerald-600">− LKR {fmt(totalDisc)}</span>} />
              <MetaRow label="Tax" value={`LKR ${fmt(totalTax)}`} />
              <div className="flex justify-between gap-3 border-t pt-2.5 text-sm">
                <span className="font-bold">Grand Total</span>
                <span className="font-bold tabular-nums text-primary">LKR {fmt(grandTotal)}</span>
              </div>
            </SidebarBlock>

            <SidebarBlock title="Supplier Summary">
              {!supplierId ? (
                <p className="text-xs text-muted-foreground">Select a supplier to view credit & purchase history.</p>
              ) : loadingSupplierDetail && !supplier ? (
                <p className="text-xs text-muted-foreground">Loading supplier details…</p>
              ) : (
                <>
                  <MetaRow label="Supplier" value={supplier?.name ?? "—"} />
                  <MetaRow label="Phone" value={dash(supplier?.phone)} />
                  <MetaRow label="Credit Period" value={supplier?.creditDays != null ? `${supplier.creditDays} days` : "—"} />
                  <MetaRow label="Outstanding" value={supplier?.balance != null ? `LKR ${fmt(supplier.balance)}` : "—"} />
                  <MetaRow label="Credit Limit" value={supplier?.creditLimit != null ? `LKR ${fmt(supplier.creditLimit)}` : "—"} />
                  <MetaRow
                    label="Last Purchase"
                    value={loadingSupplierDetail && !supplier?.lastPurchaseDate ? "Loading…" : fmtDate(supplier?.lastPurchaseDate)}
                  />
                </>
              )}
            </SidebarBlock>

            <SidebarBlock title="Order Information">
              <MetaRow label="Created By" value={user?.name ?? "—"} />
              <MetaRow label="Date" value={todayIso} />
              <MetaRow label="Branch" value={activeBranchName || "—"} />
              <MetaRow label="Warehouse" value={<span className="inline-flex items-center gap-1"><Warehouse className="h-3 w-3" />Default</span>} />
            </SidebarBlock>

            <div className="hidden rounded-xl bg-card p-4  border border-border xl:block">
              <h3 className="text-sm font-semibold">Selected product</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Click a table row</p>
              <div className="mt-3">
                {!selectedItem ? (
                  <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    No row selected
                  </p>
                ) : (
                  <SelectedProductPanel item={selectedItem} variant={selectedVariant} supplierName={supplier?.name} compact />
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-3">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <div className="md:hidden">
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="text-sm font-bold tabular-nums text-primary">LKR {fmt(grandTotal)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push("/purchases")} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => submit(false)}
                disabled={saving || !supplierId || items.length === 0}
                className="hidden sm:inline-flex"
              >
                Save Draft
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => submit(false)}
              disabled={saving || !supplierId || items.length === 0}
              className="flex-1 sm:hidden"
            >
              Draft
            </Button>
            {fromGrnId ? (
              <Button
                size="sm"
                onClick={() => submit(false)}
                disabled={saving || !supplierId || items.length === 0 || grnPrefillLoading}
                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 sm:flex-none"
              >
                <FileText className="h-4 w-4" />
                <span className="truncate">Create & link GRN</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => submit(true)}
                disabled={saving || !supplierId || items.length === 0}
                className="flex-1 gap-1.5 sm:flex-none"
              >
                <FileText className="h-4 w-4" />
                Create Purchase Order
              </Button>
            )}
          </div>
        </div>
      </div>

      {(searchOpen !== null || (productSearchOpen && supplierId)) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setSearchOpen(null);
            setProductSearchOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SelectedProductPanel({
  item,
  variant,
  supplierName,
  compact,
}: {
  item: LineItem;
  variant?: VariantOpt;
  supplierName?: string;
  compact?: boolean;
}) {
  const rows: [string, string | number][] = [
    ["Brand", dash(variant?.brand)],
    ["Category", dash(variant?.category)],
    ["Barcode", variant?.barcode ?? item.barcode ?? "—"],
    ["SKU", item.sku || "—"],
    ["Current Stock", variant?.stock ?? "—"],
    ["Reserved Stock", variant?.reservedStock ?? "—"],
    ["Available Stock", variant?.availableStock ?? (variant?.stock != null ? variant.stock : "—")],
    ["Last Purchase Date", fmtDate(variant?.lastPurchaseDate)],
    ["Last Purchase Qty", dash(variant?.lastPurchaseQty)],
    ["Last Buying Price", variant?.lastBuyingPrice != null ? `LKR ${fmtMoney(variant.lastBuyingPrice)}` : "—"],
    ["Current Buying", `LKR ${fmtMoney(item.unitCost)}`],
    ["Selling Price", variant?.sellingPrice != null || variant?.unitPrice != null
      ? `LKR ${fmtMoney(Number(variant.sellingPrice ?? variant.unitPrice))}`
      : "—"],
    ["Supplier", supplierName ?? "—"],
    ["Lead Time", variant?.leadTimeDays != null ? `${variant.leadTimeDays} days` : "—"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background ${compact ? "h-12 w-12" : "h-14 w-14"}`}>
          {(item.imageUrl || variant?.imageUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl || variant?.imageUrl || ""} alt={item.productName} className="h-full w-full object-cover" />
          ) : (
            <Package className="h-5 w-5 text-muted-foreground/60" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.productName}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{item.sku}</p>
          {item.variantName && <p className="truncate text-xs text-muted-foreground">{item.variantName}</p>}
        </div>
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg border bg-muted/10 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate text-xs font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Read only · values from supplier catalog</p>
    </div>
  );
}
