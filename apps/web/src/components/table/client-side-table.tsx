"use client";

import * as React from "react";
import {
  ClientSideTable as BaseClientSideTable,
  TableProvider,
  createTableConfig,
  type TableConfigInput,
} from "react-table-craft";
import { cn } from "@/lib/utils";
import {
  TableFilterBar,
  applyTableFilters,
  type AppTableFilterColumn,
  type AppTableSearchColumn,
} from "./table-filter-bar";

const DEFAULT_PAGE_SIZE = 10;
/** Only lock a scroll viewport when the list is long enough to need it. */
const FILL_HEIGHT_MIN_ROWS = 12;

const APP_TABLE_DEFAULTS: TableConfigInput = {
  features: {
    // Search/filters live in the external TableFilterBar (outside the craft card)
    search: false,
    filter: false,
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
  return Math.max(1, Math.ceil(Math.max(0, rowCount) / pageSize));
}

type CraftProps<TData, TValue> = Parameters<typeof BaseClientSideTable<TData, TValue>>[0];

export type AppClientSideTableProps<TData, TValue> = Omit<
  CraftProps<TData, TValue>,
  "filterableColumns" | "searchableColumns"
> & {
  className?: string;
  fillHeight?: boolean;
  searchableColumns?: AppTableSearchColumn<TData>[];
  filterableColumns?: AppTableFilterColumn<TData>[];
};

/**
 * App-wide modern data table — shared shell for every list page.
 * External filter bar sits above the table card (not inside it).
 */
export function ClientSideTable<TData, TValue>({
  className,
  fillHeight,
  pageCount: _pageCount,
  data,
  config,
  filterableColumns,
  searchableColumns,
  isShowExportButtons,
  ...props
}: AppClientSideTableProps<TData, TValue>) {
  const rows = React.useMemo(() => (Array.isArray(data) ? data : []) as TData[], [data]);
  const searchCols = searchableColumns ?? [];
  const filterCols = filterableColumns ?? [];
  const showFilterBar = searchCols.length > 0 || filterCols.length > 0;

  const [search, setSearch] = React.useState("");
  const [filterValues, setFilterValues] = React.useState<Record<string, string>>({});

  const deferredSearch = React.useDeferredValue(search);

  const filterKey = React.useMemo(
    () =>
      `${deferredSearch.trim()}|${Object.entries(filterValues)
        .filter(([, v]) => v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("&")}`,
    [deferredSearch, filterValues],
  );

  const filteredRows = React.useMemo(() => {
    try {
      return applyTableFilters(rows, {
        search: deferredSearch,
        searchableColumns: searchCols,
        filterValues,
        filterableColumns: filterCols,
      });
    } catch {
      return rows;
    }
  }, [rows, deferredSearch, filterValues, searchCols, filterCols]);

  // Always derive from filtered rows — parent pageCount is based on unfiltered data
  // and can crash the craft table when filters shrink the list.
  const resolvedPageCount = tablePageCount(filteredRows.length);
  const shouldFill = fillHeight ?? filteredRows.length >= FILL_HEIGHT_MIN_ROWS;

  const mergedConfig = React.useMemo(
    () =>
      createTableConfig({
        ...APP_TABLE_DEFAULTS,
        ...config,
        features: {
          ...APP_TABLE_DEFAULTS.features,
          ...config?.features,
          search: false,
          filter: false,
          columnVisibility: config?.features?.columnVisibility ?? false,
          csvExport: config?.features?.csvExport ?? false,
          rowSelection: config?.features?.rowSelection ?? false,
        },
        pagination: { ...APP_TABLE_DEFAULTS.pagination, ...config?.pagination },
        search: { ...APP_TABLE_DEFAULTS.search, ...config?.search },
      }),
    [config],
  );

  const searchPlaceholder =
    searchCols.length > 0
      ? `Search ${searchCols.map((c) => c.title).join(" / ")}...`
      : "Search...";

  const clearAll = () => {
    setSearch("");
    setFilterValues({});
  };

  const safeFilters = filterCols
    .filter((col) => col && col.id && Array.isArray(col.options))
    .map((col) => ({
      id: col.id,
      title: col.title || col.id,
      options: col.options.filter((o) => o && o.value != null),
      value: filterValues[col.id] ?? "",
      onChange: (value: string) =>
        setFilterValues((prev) => {
          const next = { ...prev };
          if (!value) delete next[col.id];
          else next[col.id] = value;
          return next;
        }),
    }));

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
      {showFilterBar ? (
        <TableFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={searchPlaceholder}
          showSearch={searchCols.length > 0}
          filters={safeFilters}
          onClear={clearAll}
          resultCount={filteredRows.length}
          totalCount={rows.length}
        />
      ) : null}

      <div
        data-table-craft
        data-table-modern
        data-fill-height={shouldFill ? "true" : "false"}
        data-has-filters="false"
        className="w-full min-w-0"
      >
        <TableProvider config={mergedConfig}>
          <BaseClientSideTable
            key={filterKey}
            {...props}
            data={filteredRows}
            pageCount={resolvedPageCount}
            config={mergedConfig}
            filterableColumns={[]}
            searchableColumns={[]}
            isShowExportButtons={isShowExportButtons ?? { isShow: false }}
          />
        </TableProvider>
      </div>
    </div>
  );
}
