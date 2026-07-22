"use client";

import {
  ClientSideTable as BaseClientSideTable,
  TableProvider,
  createTableConfig,
  type TableConfigInput,
} from "react-table-craft";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 10;

const APP_TABLE_DEFAULTS: TableConfigInput = {
  features: {
    search: true,
    filter: true,
    pagination: true,
    columnVisibility: true,
    csvExport: true,
    rowSelection: true,
    viewToggle: true,
    floatingBar: false,
    advancedFilter: false,
    sorting: true,
  },
  pagination: {
    pageSizeOptions: [10, 25, 50],
    defaultPageSize: DEFAULT_PAGE_SIZE,
  },
  search: {
    debounceMs: 300,
    minSearchLength: 0,
  },
};

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
 *
 * Layout (top → bottom):
 * 1. Toolbar — view toggle · search · columns · export
 * 2. Filters — faceted chips (when configured)
 * 3. Body — sticky header · rows · empty state
 * 4. Pagination — count · page size · pages
 */
export function ClientSideTable<TData, TValue>({
  className,
  fillHeight = true,
  pageCount,
  data,
  config,
  ...props
}: AppClientSideTableProps<TData, TValue>) {
  const rows = (data ?? []) as TData[];
  const resolvedPageCount = pageCount ?? tablePageCount(rows.length);
  const mergedConfig = createTableConfig({
    ...APP_TABLE_DEFAULTS,
    ...config,
    features: { ...APP_TABLE_DEFAULTS.features, ...config?.features },
    pagination: { ...APP_TABLE_DEFAULTS.pagination, ...config?.pagination },
    search: { ...APP_TABLE_DEFAULTS.search, ...config?.search },
  });

  return (
    <div
      data-table-craft
      data-fill-height={fillHeight ? "true" : "false"}
      className={cn("w-full min-w-0 flex flex-col", className)}
    >
      <TableProvider config={mergedConfig}>
        <BaseClientSideTable data={rows} pageCount={resolvedPageCount} config={mergedConfig} {...props} />
      </TableProvider>
    </div>
  );
}
