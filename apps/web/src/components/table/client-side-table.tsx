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

const EMPTY_SEARCH: AppTableSearchColumn<unknown>[] = [];
const EMPTY_FILTERS: AppTableFilterColumn<unknown>[] = [];

/** Standard pageCount for client-side tables (min 1). */
export function tablePageCount(rowCount: number, pageSize = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(rowCount / pageSize));
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
  pageCount,
  data,
  config,
  filterableColumns,
  searchableColumns,
  isShowExportButtons,
  ...props
}: AppClientSideTableProps<TData, TValue>) {
  const rows = (data ?? []) as TData[];
  const searchCols = (searchableColumns ?? EMPTY_SEARCH) as AppTableSearchColumn<TData>[];
  const filterCols = (filterableColumns ?? EMPTY_FILTERS) as AppTableFilterColumn<TData>[];
  const showFilterBar = searchCols.length > 0 || filterCols.length > 0;

  const [search, setSearch] = React.useState("");
  const [filterValues, setFilterValues] = React.useState<Record<string, string>>({});

  const deferredSearch = React.useDeferredValue(search);

  const filteredRows = React.useMemo(
    () =>
      applyTableFilters(rows, {
        search: deferredSearch,
        searchableColumns: searchCols,
        filterValues,
        filterableColumns: filterCols,
      }),
    [rows, deferredSearch, filterValues, searchCols, filterCols],
  );

  const resolvedPageCount = pageCount ?? tablePageCount(filteredRows.length);
  const shouldFill = fillHeight ?? filteredRows.length >= FILL_HEIGHT_MIN_ROWS;

  const mergedConfig = createTableConfig({
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
  });

  const searchPlaceholder =
    searchCols.length > 0
      ? `Search ${searchCols.map((c) => c.title).join(" / ")}…`
      : "Search…";

  const clearAll = () => {
    setSearch("");
    setFilterValues({});
  };

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
      {showFilterBar ? (
        <TableFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={searchPlaceholder}
          showSearch={searchCols.length > 0}
          filters={filterCols.map((col) => ({
            id: col.id,
            title: col.title,
            options: col.options,
            value: filterValues[col.id] ?? "",
            onChange: (value) =>
              setFilterValues((prev) => {
                const next = { ...prev };
                if (!value) delete next[col.id];
                else next[col.id] = value;
                return next;
              }),
          }))}
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
