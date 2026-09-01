"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Plus, Search, User, X } from "lucide-react";
import type { Customer } from "@/types";
import { cn } from "@/lib/utils";

export type PosCartCustomerListItem = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tier?: string;
  loyaltyPoints: number;
  walletBalance: number;
  creditLimit: number;
  creditBalance: number;
};

type Props = {
  retailUi?: boolean;
  customerLabel: string;
  customer: Customer | null;
  open: boolean;
  search: string;
  loading: boolean;
  customers: PosCartCustomerListItem[];
  focusedIdx: number;
  showNewForm: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onToggle: () => void;
  onSearchChange: (value: string) => void;
  onFocusIdxChange: (idx: number) => void;
  onSelectWalkIn: () => void;
  onSelectCustomer: (c: PosCartCustomerListItem) => void;
  onRemoveCustomer: () => void;
  onRegister: (phoneHint?: string) => void;
  onRegisterFromEmpty: () => void;
};

export function PosCartCustomerPicker({
  retailUi = false,
  customerLabel,
  customer,
  open,
  search,
  loading,
  customers,
  focusedIdx,
  showNewForm,
  containerRef,
  searchRef,
  onToggle,
  onSearchChange,
  onFocusIdxChange,
  onSelectWalkIn,
  onSelectCustomer,
  onRemoveCustomer,
  onRegister,
  onRegisterFromEmpty,
}: Props) {
  return (
    <div
      className={retailUi ? "pos-block-section shrink-0 relative" : "px-4 py-2 border-b shrink-0 relative"}
      style={{ borderColor: retailUi ? undefined : "var(--pos-border)" }}
      ref={containerRef}
    >
      {retailUi && (
        <h5 className="pos-block-section-title">Customer Information</h5>
      )}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all hover:bg-white/5 text-left"
        style={{
          background: customer ? "rgba(var(--pos-accent-rgb),0.1)" : "var(--pos-card)",
          border: `1px solid ${open ? "var(--pos-accent)" : customer ? "rgba(var(--pos-accent-rgb),0.35)" : "var(--pos-border)"}`,
        }}
      >
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: customer ? "var(--pos-accent-grad)" : "var(--pos-input)" }}
        >
          {customer ? (
            <span className="text-white text-xs font-bold">{customer.name?.[0] ?? "?"}</span>
          ) : (
            <User className="h-4 w-4" style={{ color: "var(--pos-muted)" }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-wide leading-none mb-0.5"
            style={{ color: "var(--pos-muted)" }}
          >
            {customerLabel}
          </p>
          <p
            className="text-sm font-bold truncate leading-tight"
            style={{ color: customer ? "var(--pos-text)" : "var(--pos-muted)" }}
          >
            {customer ? customer.name : "Walk-In Customer"}
          </p>
          {customer?.phone && (
            <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--pos-muted)" }}>
              {customer.phone}
            </p>
          )}
        </div>
        {customer && !open ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveCustomer();
            }}
            className="p-1.5 rounded-lg hover:bg-white/10 shrink-0"
            title="Remove customer"
          >
            <X className="h-3.5 w-3.5" style={{ color: "var(--pos-muted)" }} />
          </button>
        ) : (
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            style={{ color: "var(--pos-accent)" }}
          />
        )}
      </button>
      {open && (
        <div
          className="absolute left-4 right-4 top-full mt-1 z-50 rounded-xl border shadow-2xl overflow-hidden"
          style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
        >
          <div className="flex items-center gap-2 p-2 border-b" style={{ borderColor: "var(--pos-border)" }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--pos-accent)" }} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => {
                onSearchChange(e.target.value);
                onFocusIdxChange(0);
              }}
              placeholder="Type phone or name…"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 h-8 px-1.5 text-xs text-white outline-none bg-transparent font-mono"
            />
            <button
              type="button"
              onClick={() => onRegister(/^\d+$/.test(search.trim()) ? search.trim() : undefined)}
              className="h-7 px-2 rounded-lg text-[10px] font-bold text-white shrink-0 flex items-center gap-1"
              style={{ background: "var(--pos-accent)" }}
            >
              <Plus className="h-3 w-3" />
              Register
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            <button
              type="button"
              onClick={onSelectWalkIn}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 text-left"
              style={{ background: !customer ? "rgba(var(--pos-accent-rgb),0.1)" : "transparent" }}
            >
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--pos-input)" }}
              >
                <User className="h-3.5 w-3.5" style={{ color: "var(--pos-muted)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">Walk-In Customer</p>
                <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>
                  No account on bill
                </p>
              </div>
              {!customer && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--pos-success)" }} />}
            </button>
            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--pos-accent)" }} />
              </div>
            )}
            {!loading && customers.length === 0 && search && !showNewForm && (
              <div className="text-center py-4 space-y-2">
                <p className="text-xs" style={{ color: "var(--pos-muted-2)" }}>
                  No customers found
                </p>
                <button
                  type="button"
                  onClick={onRegisterFromEmpty}
                  className="text-[10px] font-bold px-3 h-7 rounded-lg text-white"
                  style={{ background: "var(--pos-accent)" }}
                >
                  Register new
                </button>
              </div>
            )}
            {!loading &&
              customers.map((c, cIdx) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectCustomer(c)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 text-left"
                  style={{
                    background:
                      focusedIdx === cIdx || customer?.id === c.id
                        ? "rgba(var(--pos-accent-rgb),0.12)"
                        : "transparent",
                    outline: focusedIdx === cIdx ? "1px solid var(--pos-accent)" : "none",
                  }}
                >
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ background: "var(--pos-accent-grad)" }}
                  >
                    {c.name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{c.name}</p>
                    <p className="text-[10px] truncate" style={{ color: "var(--pos-muted)" }}>
                      {c.phone}
                    </p>
                  </div>
                  {customer?.id === c.id ? (
                    <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--pos-success)" }} />
                  ) : (
                    <span className="text-[9px] capitalize shrink-0" style={{ color: "var(--pos-warn)" }}>
                      {c.tier}
                    </span>
                  )}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
