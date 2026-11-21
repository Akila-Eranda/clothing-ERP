"use client";

import * as React from "react";
import { Search, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEX_BTN } from "@/lib/app-button-classes";
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
        "rounded-2xl border bg-card px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
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
              aria-label={searchPlaceholder.replace(/\.{3}$|…$/, "")}
              className="h-10 w-full rounded-xl border bg-background pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
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
          <label key={f.id} className="inline-flex h-10 items-center gap-1.5 rounded-xl border bg-background px-2.5 text-sm font-medium text-muted-foreground">
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
            variant="outline"
            size="sm"
            onClick={onClear}
            className={`h-10 ${HEX_BTN} text-sm`}
          >
            <X className="h-3.5 w-3.5" />
            Clear
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">{activeCount}</span>
          </Button>
        ) : null}

        {typeof resultCount === "number" && typeof totalCount === "number" ? (
          <p className="ml-auto text-xs font-medium tabular-nums text-muted-foreground">
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

/**
 * Search / filter columns are keyed by the table column id. Many columns have no raw field with
 * that name (e.g. id "customer" is built by an accessorFn from first/last name, phone and email),
 * so reading `row[id]` alone returned "" and the search never matched anything.
 * This adds a getValue that falls back to the column definition's accessorFn / accessorKey,
 * but only when the row has no usable raw field of that name, so existing behaviour is unchanged.
 *
 * With `{ search: true }` (search box only, never exact-match filters) the accessorFn text is also
 * used when the row DOES have a raw field, as long as that text contains the raw value: columns like
 * id "name" with accessorFn `${name} ${slug}` are meant to search every field they list, and the
 * longer text only ever adds matches.
 */
type ColumnLike<TData> = { id?: string; accessorKey?: unknown; accessorFn?: (row: TData, index: number) => unknown };

function readPath(row: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), row);
}

function toSearchText(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

export function withColumnAccessors<TData, C extends { id: string; getValue?: (row: TData) => string | number | boolean | null | undefined }>(
  cols: C[],
  columnDefs: unknown,
  opts: { search?: boolean } = {},
): C[] {
  const defs = (Array.isArray(columnDefs) ? columnDefs : []) as ColumnLike<TData>[];
  return cols.map((col) => {
    if (col.getValue) return col;
    const def = defs.find((d) => d && (d.id === col.id || d.accessorKey === col.id));
    if (!def) return col;
    return {
      ...col,
      getValue: (row: TData) => {
        const raw = toSearchText(row != null && typeof row === "object" ? (row as Record<string, unknown>)[col.id] : undefined);
        if (raw !== undefined) {
          if (opts.search && typeof def.accessorFn === "function") {
            try {
              const combined = toSearchText(def.accessorFn(row, 0));
              if (combined !== undefined && combined.toLowerCase().includes(raw.toLowerCase())) return combined;
            } catch {
              /* fall back to the raw field */
            }
          }
          return raw;
        }
        try {
          if (typeof def.accessorFn === "function") return toSearchText(def.accessorFn(row, 0)) ?? "";
          if (typeof def.accessorKey === "string") return toSearchText(readPath(row, def.accessorKey)) ?? "";
        } catch {
          return "";
        }
        return "";
      },
    };
  });
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
