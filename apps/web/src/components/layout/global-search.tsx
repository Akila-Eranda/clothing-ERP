"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Package, Users, Truck, Receipt, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Header global search (search audit, 6 Nov 2026). Calls GET /search?q= which is tenant-scoped and
 * returns only the groups the user may read. Debounced; only the newest response is shown.
 */
type Item = { id: string; title: string; subtitle?: string; href: string };
type Group = { type: "products" | "customers" | "suppliers" | "sales"; label: string; items: Item[] };

const MIN = 2;
const DEBOUNCE_MS = 250;
const ICONS = { products: Package, customers: Users, suppliers: Truck, sales: Receipt } as const;

export type GlobalSearchHandle = { focus: () => void };

export const GlobalSearch = React.forwardRef<GlobalSearchHandle, { variant?: "inline" | "panel"; onNavigate?: () => void; autoFocus?: boolean }>(
  function GlobalSearch({ variant = "inline", onNavigate, autoFocus }, ref) {
    const router = useRouter();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const wrapRef = React.useRef<HTMLDivElement>(null);
    const listId = React.useId();
    const [q, setQ] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [groups, setGroups] = React.useState<Group[]>([]);
    const [active, setActive] = React.useState(-1);
    const seq = React.useRef(0);

    React.useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

    const flat = React.useMemo(() => groups.flatMap((g) => g.items.map((it) => ({ ...it, type: g.type }))), [groups]);
    const term = q.replace(/\s+/g, " ").trim();

    React.useEffect(() => {
      if (term.length < MIN) {
        setGroups([]); setLoading(false); setError(null);
        return;
      }
      const mine = ++seq.current;
      const ctrl = new AbortController();
      setLoading(true); setError(null);
      const t = window.setTimeout(async () => {
        try {
          const res = await api.get<{ query: string; groups: Group[] }>(`/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
          if (mine !== seq.current) return; // a newer search started
          const payload = (res as unknown as { data?: { groups?: Group[] } }).data ?? (res as unknown as { groups?: Group[] });
          setGroups(Array.isArray(payload?.groups) ? payload.groups : []);
          setActive(-1);
        } catch (e) {
          if ((e as Error)?.name === "AbortError" || mine !== seq.current) return;
          setGroups([]); setError("Search failed. Try again.");
        } finally {
          if (mine === seq.current) setLoading(false);
        }
      }, DEBOUNCE_MS);
      return () => { window.clearTimeout(t); ctrl.abort(); };
    }, [term]);

    React.useEffect(() => {
      const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }, []);

    const go = (item: Item) => {
      setOpen(false); setQ("");
      onNavigate?.();
      router.push(item.href);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") { if (q) setQ(""); else inputRef.current?.blur(); setOpen(false); return; }
      if (!flat.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % flat.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? flat.length - 1 : i - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); go(flat[Math.max(0, active)]); }
    };

    const showPanel = open && term.length > 0;
    let idx = -1;

    return (
      <div ref={wrapRef} className={cn("relative w-full", variant === "panel" && "p-3")} data-global-search>
        <div className="hex-header__search">
          <Search className="hex-header__search-icon" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label="Search products, customers, suppliers and sales"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            autoFocus={autoFocus}
            autoComplete="off"
            placeholder="Search products, customers, orders..."
            className="hex-header__search-input flex w-full outline-none"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {q ? (
            <button type="button" aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => { setQ(""); inputRef.current?.focus(); }}>
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            variant === "inline" && <kbd className="hex-header__search-kbd">⌘K</kbd>
          )}
        </div>

        {showPanel && (
          <div
            id={listId}
            role="listbox"
            aria-label="Search results"
            className={cn(
              "z-50 mt-1 max-h-[70vh] overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg",
              variant === "inline" ? "absolute left-0 right-0 top-full" : "relative",
            )}
          >
            {term.length < MIN ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Type at least {MIN} characters</p>
            ) : loading && !flat.length ? (
              <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…</p>
            ) : error ? (
              <p className="px-3 py-2 text-xs text-destructive" role="alert">{error}</p>
            ) : !flat.length ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No results for “{term}”</p>
            ) : (
              groups.map((g) => {
                const Icon = ICONS[g.type] ?? Search;
                return (
                  <div key={g.type} role="group" aria-label={g.label} className="py-1">
                    <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                    {g.items.map((it) => {
                      idx += 1;
                      const i = idx;
                      return (
                        <div
                          key={`${g.type}-${it.id}`}
                          id={`${listId}-${i}`}
                          role="option"
                          aria-selected={active === i}
                          className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm", active === i ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")}
                          onMouseEnter={() => setActive(i)}
                          onMouseDown={(e) => { e.preventDefault(); go(it); }}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{it.title}</span>
                            {it.subtitle ? <span className="block truncate text-xs text-muted-foreground">{it.subtitle}</span> : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  },
);
