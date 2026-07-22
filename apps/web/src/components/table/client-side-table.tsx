"use client";

import { ClientSideTable as BaseClientSideTable } from "react-table-craft";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 10;

/** Standard pageCount for client-side tables (min 1). */
export function tablePageCount(rowCount: number, pageSize = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(rowCount / pageSize));
}

type CraftProps<TData, TValue> = Parameters<typeof BaseClientSideTable<TData, TValue>>[0];

export type AppClientSideTableProps<TData, TValue> = CraftProps<TData, TValue> & {
  /** Extra classes on the outer craft card */
  className?: string;
  /**
   * Main list pages: fill remaining viewport neatly.
   * Hub embeds with several small tables should pass `fillHeight={false}`.
   * Defaults to true.
   */
  fillHeight?: boolean;
};

/**
 * App-wide data table — single module for every list page.
 * Styles: `[data-table-craft]` in globals.css (toolbar / rows / pagination).
 */
export function ClientSideTable<TData, TValue>({
  className,
  fillHeight = true,
  pageCount,
  data,
  ...props
}: AppClientSideTableProps<TData, TValue>) {
  const rows = (data ?? []) as TData[];
  const resolvedPageCount = pageCount ?? tablePageCount(rows.length);

  return (
    <div
      data-table-craft
      className={cn(
        "w-full min-w-0",
        fillHeight
          ? "flex flex-col min-h-[420px] h-[min(72vh,calc(100dvh-200px))]"
          : "flex flex-col",
        className,
      )}
    >
      <div className={cn("min-h-0 w-full", fillHeight ? "flex-1 overflow-hidden" : "w-full")}>
        <BaseClientSideTable data={rows} pageCount={resolvedPageCount} {...props} />
      </div>
    </div>
  );
}
