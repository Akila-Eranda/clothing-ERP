"use client";

import { ClientSideTable as BaseClientSideTable } from "react-table-craft";

/**
 * App-wide wrapper for react-table-craft's ClientSideTable.
 * The `data-table-craft` attribute activates the enterprise table + toolbar
 * surface styles defined in globals.css (solid card surfaces, visible search).
 */
export function ClientSideTable<TData, TValue>(
  props: Parameters<typeof BaseClientSideTable<TData, TValue>>[0],
) {
  return (
    <div data-table-craft className="w-full min-w-0">
      <BaseClientSideTable {...props} />
    </div>
  );
}
