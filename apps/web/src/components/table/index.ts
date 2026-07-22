/**
 * App-wide data table module.
 *
 * All list / data grids should import from `@/components/table` (this barrel)
 * so search, filters, pagination, export, and `[data-table-craft]` styles stay
 * consistent across the product.
 *
 * Stack order: toolbar → filters → sticky header body → pagination footer.
 *
 * Use for: dashboard list pages, admin lists, hub data grids.
 * Do NOT use for: print/receipt HTML, POS cart line editors, financial
 * statement layouts that need custom row/column spanning.
 */
export { ClientSideTable, tablePageCount, type AppClientSideTableProps } from "./client-side-table";
export { DataTableColumnHeader } from "./data-table-column-header";
export { TableActionsRow } from "./table-actions-row";
export { OpenRecordButton } from "./open-record-button";
