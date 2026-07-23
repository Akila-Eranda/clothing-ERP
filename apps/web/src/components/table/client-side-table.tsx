"use client";

import {
  ClientSideTable as BaseClientSideTable,
  TableProvider,
  createTableConfig,
  type TableConfigInput,
} from "react-table-craft";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 10;
/** Only lock a scroll viewport when the list is long enough to need it. */
const FILL_HEIGHT_MIN_ROWS = 12;

const APP_TABLE_DEFAULTS: TableConfigInput = {
  features: {
    // Search + faceted filters on by default for every list page
    search: true,
    filter: true,
    pagination: true,
    columnVisibility: false,
    csvExport: false,
    rowSelection: false,
    viewToggle: false,
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
   * When true, long lists scroll inside a max-height.
   * Default: auto — only when there are enough rows (avoids empty stretched gap).
   */
  fillHeight?: boolean;
};

/**
 * App-wide modern data table — shared shell for every list page.
 * Styles live on `[data-table-craft]` in globals.css.
 */
export function ClientSideTable<TData, TValue>({
  className,
  fillHeight,
  pageCount,
  data,
  config,
  filterableColumns,
  searchableColumns,
  isShowExportButtons,
  ...props
}: AppClientSideTableProps<TData, TValue>) {
  const rows = (data ?? []) as TData[];
  const resolvedPageCount = pageCount ?? tablePageCount(rows.length);
  const shouldFill = fillHeight ?? rows.length >= FILL_HEIGHT_MIN_ROWS;
  const hasSearch = (searchableColumns?.length ?? 0) > 0;
  const hasFilters = (filterableColumns?.length ?? 0) > 0;
  const mergedConfig = createTableConfig({
    ...APP_TABLE_DEFAULTS,
    ...config,
    features: {
      ...APP_TABLE_DEFAULTS.features,
      ...config?.features,
      // Auto-enable from props; pages can still force via config.features
      search: config?.features?.search ?? hasSearch,
      filter: config?.features?.filter ?? hasFilters,
      columnVisibility: config?.features?.columnVisibility ?? false,
      csvExport: config?.features?.csvExport ?? false,
      rowSelection: config?.features?.rowSelection ?? false,
    },
    pagination: { ...APP_TABLE_DEFAULTS.pagination, ...config?.pagination },
    search: { ...APP_TABLE_DEFAULTS.search, ...config?.search },
  });

  return (
    <div
      data-table-craft
      data-table-modern
      data-fill-height={shouldFill ? "true" : "false"}
      data-has-filters={hasFilters ? "true" : "false"}
      className={cn("w-full min-w-0", className)}
    >
      <TableProvider config={mergedConfig}>
        <BaseClientSideTable
          {...props}
          data={rows}
          pageCount={resolvedPageCount}
          config={mergedConfig}
          filterableColumns={filterableColumns ?? []}
          searchableColumns={searchableColumns ?? []}
          isShowExportButtons={isShowExportButtons ?? { isShow: false }}
        />
      </TableProvider>
    </div>
  );
}
