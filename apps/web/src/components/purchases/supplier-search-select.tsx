"use client";

import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FORM_DROPDOWN, PO_FIELD } from "@/lib/form-shell-theme";
import {
  filterSuppliers, mergeSuppliers, moveActiveIndex, needsServerSearch, parseSupplierPage,
  supplierDetail, supplierLookupPath, SUPPLIER_SEARCH_DEBOUNCE_MS, SUPPLIER_SEARCH_PLACEHOLDER,
  type SupplierOption,
} from "@/lib/supplier-search";

export interface SupplierSearchOption extends SupplierOption {
  contactPerson?: string | null;
  city?: string | null;
}

interface Props {
  suppliers: SupplierSearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  totalSuppliers?: number | null;
  loading?: boolean;
}

export const SupplierSearchSelect = forwardRef<HTMLInputElement, Props>(function SupplierSearchSelect(
  { suppliers, value, onChange, placeholder = SUPPLIER_SEARCH_PLACEHOLDER, totalSuppliers = null, loading = false },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<SupplierSearchOption[]>([]);
  const [selectedRemote, setSelectedRemote] = useState<SupplierSearchOption | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = suppliers.find((s) => s.id === value) ?? selectedRemote;
  const serverSearch = open && needsServerSearch(query, { loaded: suppliers.length, total: totalSuppliers });

  useEffect(() => {
    if (!serverSearch) { setRemote([]); setRemoteLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemoteLoading(true);
      try {
        const response = await api.get<unknown>(supplierLookupPath(query), { signal: controller.signal });
        if (!controller.signal.aborted) setRemote(parseSupplierPage<SupplierSearchOption>(response).rows);
      } catch {
        if (!controller.signal.aborted) setRemote([]);
      } finally {
        if (!controller.signal.aborted) setRemoteLoading(false);
      }
    }, SUPPLIER_SEARCH_DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, serverSearch]);

  const filtered = useMemo(
    () => mergeSuppliers(filterSuppliers(suppliers, query), filterSuppliers(remote, query)),
    [suppliers, remote, query],
  );

  useEffect(() => { setActive((current) => moveActiveIndex(current, "", filtered.length)); }, [filtered.length]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (id: string) => {
    setSelectedRemote(id ? filtered.find((s) => s.id === id) ?? null : null);
    onChange(id); setOpen(false); setQuery("");
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      e.preventDefault(); setOpen(true); setActive((i) => moveActiveIndex(i, e.key, filtered.length));
    } else if (e.key === "Enter" && open && filtered[active]) {
      e.preventDefault(); pick(filtered[active].id);
    } else if (e.key === "Escape") { setOpen(false); setQuery(""); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref} value={open ? query : selected?.name ?? ""} disabled={loading}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        placeholder={selected && open ? selected.name : (loading ? "Loading..." : placeholder)}
        className={cn(PO_FIELD, "pl-9 pr-16")} autoComplete="off" role="combobox"
        aria-expanded={open} aria-controls="supplier-payment-options"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {selected && !open && <button type="button" onClick={() => pick("")} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Clear supplier"><X className="h-3.5 w-3.5" /></button>}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      {open && <div className={cn(FORM_DROPDOWN, "z-[100]")}><div id="supplier-payment-options" ref={listRef} className="max-h-72 overflow-y-auto py-1" role="listbox">
        {filtered.length === 0 ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">{remoteLoading ? "Searching..." : "No suppliers found"}</p> :
          filtered.map((s, idx) => {
            const meta = supplierDetail(s) || [s.contactPerson, s.city].filter(Boolean).join(" · ");
            return <button key={s.id} type="button" data-idx={idx} role="option" aria-selected={s.id === value}
              onMouseEnter={() => setActive(idx)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s.id)}
              className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", idx === active ? "bg-muted" : "hover:bg-muted/50")}>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.name}</span>{meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}</span>
              {s.id === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>;
          })}
      </div>{filtered.length > 0 && <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">{filtered.length} suppliers · ↑↓ to move · Enter to select</div>}</div>}
    </div>
  );
});
