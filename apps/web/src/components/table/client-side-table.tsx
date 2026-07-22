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
   * When true, the table body scrolls inside a max-height (no empty gap below short lists).
   * Defaults to true for list pages. Pass false for compact hub embeds.
   */
  fillHeight?: boolean;
};

/**
 * App-wide data table — single module for every list page.
 * Card height follows content; long lists scroll inside the body (no bottom empty space).
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
      data-fill-height={fillHeight ? "true" : "false"}
      className={cn("w-full min-w-0 flex flex-col", className)}
    >
      <BaseClientSideTable data={rows} pageCount={resolvedPageCount} {...props} />
    </div>
  );
}
