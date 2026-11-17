"use client";

import * as React from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { POS_OWN_KEYS_ATTR } from "@/lib/pos-key-owner";
import {
  filterSuppliers,
  mergeSuppliers,
  moveActiveIndex,
  needsServerSearch,
  parseSupplierPage,
  supplierDetail,
  supplierLookupPath,
  SUPPLIER_SEARCH_DEBOUNCE_MS,
  SUPPLIER_SEARCH_PLACEHOLDER,
  type SupplierOption,
} from "@/lib/supplier-search";

type Props<T extends SupplierOption> = {
  /** Suppliers preloaded by the screen (first page). */
  suppliers: T[];
  /** Total suppliers of the shop reported by the API, when known (decides whether the server is searched). */
  totalSuppliers: number | null;
  value: string;
  onSelect: (supplier: T) => void;
  loading?: boolean;
  disabled?: boolean;
};

/**
 * Searchable supplier picker (ARIA combobox + listbox). Filters the preloaded suppliers instantly; when the shop has
 * more suppliers than were preloaded it also runs a debounced server search (2+ characters) on /suppliers/lookup.
 */
export function PosSupplierCombobox<T extends SupplierOption>({ suppliers, totalSuppliers, value, onSelect, loading, disabled }: Props<T>) {
  const id = React.useId();
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(-1);
  const [remote, setRemote] = React.useState<T[]>([]);
  const [remoteLoading, setRemoteLoading] = React.useState(false);
  const [remoteFailed, setRemoteFailed] = React.useState(false);

  const selected = React.useMemo(() => suppliers.find((s) => s.id === value) ?? null, [suppliers, value]);
  const serverSearch = open && needsServerSearch(query, { loaded: suppliers.length, total: totalSuppliers });

  // Debounced server search, only when the preloaded list may be incomplete. Stale requests are aborted.
  React.useEffect(() => {
    if (!serverSearch) { setRemote([]); setRemoteLoading(false); setRemoteFailed(false); return; }
    const ctrl = new AbortController();
    setRemoteLoading(true);
    setRemoteFailed(false);
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get<unknown>(supplierLookupPath(query), { signal: ctrl.signal });
        if (!ctrl.signal.aborted) setRemote(parseSupplierPage<T>(res).rows);
      } catch {
        if (!ctrl.signal.aborted) { setRemote([]); setRemoteFailed(true); }
      } finally {
        if (!ctrl.signal.aborted) setRemoteLoading(false);
      }
    }, SUPPLIER_SEARCH_DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); ctrl.abort(); };
  }, [serverSearch, query]);

  const options = React.useMemo(
    () => mergeSuppliers(filterSuppliers(suppliers, query), filterSuppliers(remote, query)),
    [suppliers, remote, query],
  );

  React.useEffect(() => { setActive((a) => moveActiveIndex(a, "", options.length)); }, [options.length]);
  React.useEffect(() => {
    if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const openList = () => {
    if (disabled) return;
    setQuery("");
    setActive(selected ? suppliers.findIndex((s) => s.id === selected.id) : -1);
    setOpen(true);
  };
  const close = () => { setOpen(false); setQuery(""); setActive(-1); };
  const choose = (s: T) => { onSelect(s); close(); inputRef.current?.blur(); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || ((e.key === "Home" || e.key === "End") && open)) {
      e.preventDefault();
      if (!open) { openList(); return; }
      setActive((a) => moveActiveIndex(a, e.key, options.length));
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      if (active >= 0 && options[active]) choose(options[active]);
    } else if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      if (open) close();
    }
  };

  const placeholder = loading ? "Loading..." : SUPPLIER_SEARCH_PLACEHOLDER;
  const showEmpty = open && options.length === 0 && !(serverSearch && remoteLoading);

  return (
    <div className="relative flex-1 min-w-0" {...(open ? { [POS_OWN_KEYS_ATTR]: "true" } : {})}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Supplier"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 && options[active] ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled || loading}
        placeholder={placeholder}
        value={open ? query : (selected?.name ?? "")}
        onFocus={() => { if (!open) openList(); }}
        onClick={() => { if (!open) openList(); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onKeyDown={onKeyDown}
        onBlur={() => close()}
        className="w-full h-10 rounded-xl text-sm pl-3 pr-9 text-white outline-none disabled:opacity-60"
        style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--pos-muted)" }}>
        {serverSearch && remoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
      </span>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suppliers"
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full mt-1 z-30 max-h-64 overflow-y-auto rounded-xl py-1 shadow-xl"
          style={{ background: "var(--pos-card)", border: "1px solid var(--pos-border)" }}
        >
          {options.map((s, i) => {
            const detail = supplierDetail(s);
            const isActive = i === active;
            const isSelected = s.id === value;
            return (
              <li
                key={s.id}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                // keep focus in the input so blur does not close the list before the click lands
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
                className="px-3 py-2 cursor-pointer text-sm"
                style={{ background: isActive ? "var(--pos-input)" : "transparent", color: "white" }}
              >
                <div className={isSelected ? "font-semibold" : undefined}>{s.name}</div>
                {detail && <div className="text-[11px]" style={{ color: "var(--pos-muted)" }}>{detail}</div>}
              </li>
            );
          })}
          {serverSearch && remoteLoading && options.length === 0 && (
            <li role="option" aria-disabled="true" aria-selected={false} className="px-3 py-2 text-sm" style={{ color: "var(--pos-muted)" }}>
              Searching...
            </li>
          )}
          {showEmpty && (
            <li role="option" aria-disabled="true" aria-selected={false} className="px-3 py-2 text-sm" style={{ color: "var(--pos-muted)" }}>
              No suppliers found
            </li>
          )}
          {remoteFailed && (
            <li role="option" aria-disabled="true" aria-selected={false} className="px-3 py-1.5 text-[11px]" style={{ color: "var(--pos-muted)" }}>
              Could not search all suppliers. Showing loaded suppliers only.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
