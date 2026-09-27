"use client";

import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FORM_DROPDOWN, PO_FIELD } from "@/lib/form-shell-theme";

export interface SupplierSearchOption {
  id: string;
  name: string;
  phone?: string | null;
  contactPerson?: string | null;
  city?: string | null;
}

interface Props {
  suppliers: SupplierSearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

function matches(s: SupplierSearchOption, q: string) {
  return [s.name, s.phone, s.contactPerson, s.city]
    .some((v) => v?.toLowerCase().includes(q));
}

export const SupplierSearchSelect = forwardRef<HTMLInputElement, Props>(function SupplierSearchSelect(
  { suppliers, value, onChange, placeholder = "Search supplier by name, phone or contact…" },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = suppliers.find((s) => s.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? suppliers.filter((s) => matches(s, q)) : suppliers;
  }, [suppliers, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[active]) {
        e.preventDefault();
        pick(filtered[active].id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        value={open ? query : selected?.name ?? ""}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={selected && open ? selected.name : placeholder}
        className={cn(PO_FIELD, "pl-9 pr-16")}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {selected && !open && (
          <button
            type="button"
            onClick={() => pick("")}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear supplier"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>

      {open && (
        <div className={cn(FORM_DROPDOWN, "z-[100]")}>
          <div ref={listRef} className="max-h-72 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                {suppliers.length === 0 ? "No suppliers yet" : `No supplier matches "${query.trim()}"`}
              </p>
            ) : (
              filtered.map((s, idx) => {
                const meta = [s.contactPerson, s.phone, s.city].filter(Boolean).join(" · ");
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-idx={idx}
                    role="option"
                    aria-selected={s.id === value}
                    onMouseEnter={() => setActive(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                      idx === active ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
                    </div>
                    {s.id === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
          {filtered.length > 0 && (
            <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              {filtered.length} of {suppliers.length} suppliers · ↑↓ to move · Enter to select
            </div>
          )}
        </div>
      )}
    </div>
  );
});
