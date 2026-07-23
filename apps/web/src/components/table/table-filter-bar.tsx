"use client";

import * as React from "react";
import { Search, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type AppTableSearchColumn<TData> = {
  id: string;
  title: string;
  getValue?: (row: TData) => string | number | boolean | null | undefined;
};

export type AppTableFilterColumn<TData> = {
  id: string;
  title: string;
  options: { label: string; value: string }[];
  getValue?: (row: TData) => string | number | boolean | null | undefined;
};

type TableFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  showSearch?: boolean;
  filters: {
    id: string;
    title: string;
    options: { label: string; value: string }[];
    value: string;
    onChange: (value: string) => void;
  }[];
  onClear: () => void;
  resultCount?: number;
  totalCount?: number;
  className?: string;
};

export function TableFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  showSearch = true,
  filters,
  onClear,
  resultCount,
  totalCount,
  className,
}: TableFilterBarProps) {
  const activeCount =
    (search.trim() ? 1 : 0) + filters.filter((f) => f.value && f.value !== "all").length;
  const hasActive = activeCount > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <div className="relative min-w-[12rem] flex-1 basis-[16rem] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-xl border bg-background pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
            {search ? (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        )}

        {filters.map((f) => (
          <label key={f.id} className="inline-flex h-9 items-center gap-1.5 rounded-xl border bg-background px-2.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3 w-3 shrink-0 opacity-70" />
            <span className="hidden sm:inline shrink-0">{f.title}</span>
            <select
              value={f.value || "all"}
              onChange={(e) => onChangeSafe(f.onChange, e.target.value)}
              className={cn(
                "h-full max-w-[10rem] cursor-pointer bg-transparent text-sm font-semibold text-foreground outline-none",
                f.value && f.value !== "all" && "text-primary",
              )}
            >
              <option value="all">All</option>
              { (f.options ?? []).map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {hasActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-9 gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{activeCount}</span>
          </Button>
        ) : null}

        {typeof resultCount === "number" && typeof totalCount === "number" ? (
          <p className="ml-auto text-[11px] font-medium tabular-nums text-muted-foreground">
            {hasActive ? (
              <>
                {resultCount} of {totalCount}
              </>
            ) : (
              <>{totalCount} records</>
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function onChangeSafe(onChange: (value: string) => void, value: string) {
  onChange(value === "all" ? "" : value);
}

export function resolveTableFieldValue<TData>(
  row: TData,
  col: { id: string; getValue?: (row: TData) => string | number | boolean | null | undefined },
): string {
  try {
    if (col.getValue) {
      const v = col.getValue(row);
      if (v == null) return "";
      return String(v);
    }
    if (row == null || typeof row !== "object") return "";
    const record = row as Record<string, unknown>;
    const v = record[col.id];
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    return "";
  } catch {
    return "";
  }
}

export function applyTableFilters<TData>(
  data: TData[],
  opts: {
    search: string;
    searchableColumns?: AppTableSearchColumn<TData>[];
    filterValues: Record<string, string>;
    filterableColumns?: AppTableFilterColumn<TData>[];
  },
): TData[] {
  const q = opts.search.trim().toLowerCase();
  const searchCols = opts.searchableColumns ?? [];
  const filterCols = opts.filterableColumns ?? [];

  return data.filter((row) => {
    if (q && searchCols.length > 0) {
      const hit = searchCols.some((col) =>
        resolveTableFieldValue(row, col).toLowerCase().includes(q),
      );
      if (!hit) return false;
    }
    for (const col of filterCols) {
      const selected = opts.filterValues[col.id];
      if (!selected) continue;
      const cell = resolveTableFieldValue(row, col);
      if (cell !== selected) return false;
    }
    return true;
  });
}
