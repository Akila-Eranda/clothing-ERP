"use client";

import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

export type ProductInventoryValues = {
  openingStock: string;
  reorderLevel: string;
  minStock: string;
  maxStock: string;
  warehouseId: string;
};

export const EMPTY_INVENTORY: ProductInventoryValues = {
  openingStock: "",
  reorderLevel: "",
  minStock: "",
  maxStock: "",
  warehouseId: "",
};

type WarehouseOpt = { id: string; name: string };

export function parseInventoryPayload(
  values: ProductInventoryValues,
  opts?: { mode?: "create" | "edit"; trackInventory?: boolean },
) {
  const mode = opts?.mode ?? "create";
  const track = opts?.trackInventory !== false;
  if (!track) return {};

  const openingRaw = values.openingStock.trim();
  const openingStock =
    openingRaw === ""
      ? mode === "create" ? 0 : undefined
      : Math.max(0, parseFloat(openingRaw) || 0);

  return {
    ...(openingStock !== undefined ? { openingStock } : {}),
    reorderLevel: values.reorderLevel.trim() !== "" ? parseInt(values.reorderLevel, 10) || 0 : undefined,
    minStock: values.minStock.trim() !== "" ? parseInt(values.minStock, 10) || 0 : undefined,
    maxStock: values.maxStock.trim() !== "" ? parseInt(values.maxStock, 10) || 0 : undefined,
    warehouseId: values.warehouseId || undefined,
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 min-w-0 w-full">
      <Label className="text-sm font-semibold">{label}</Label>
      {children}
      {hint ? <div className="text-xs text-muted-foreground leading-snug">{hint}</div> : null}
    </div>
  );
}

export function ProductInventoryFields({
  values,
  onChange,
  mode = "create",
  currentStock,
  layout = "sidebar",
}: {
  values: ProductInventoryValues;
  onChange: (patch: Partial<ProductInventoryValues>) => void;
  mode?: "create" | "edit";
  /** Total on-hand across variants (edit). Shown when negative so user can balance. */
  currentStock?: number | null;
  /** `wide` = main column (roomy grid); `sidebar` = narrow stack */
  layout?: "wide" | "sidebar";
}) {
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);

  useEffect(() => {
    api.get<WarehouseOpt[]>("/warehouses")
      .then((r) => setWarehouses((r.data ?? []).map((w) => ({ id: w.id, name: w.name }))))
      .catch(() => setWarehouses([]));
  }, []);

  const set = <K extends keyof ProductInventoryValues>(key: K, value: ProductInventoryValues[K]) =>
    onChange({ [key]: value });

  const isNegative = typeof currentStock === "number" && currentStock < 0;
  const showCurrent = mode === "edit" && typeof currentStock === "number";
  const wide = layout === "wide";

  return (
    <div className="space-y-4 w-full min-w-0">
      {showCurrent && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
            isNegative
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          <span className={wide ? "text-sm" : "text-xs"}>
            Current stock:{" "}
            <span className={`font-bold tabular-nums text-foreground ${wide ? "text-base" : ""}`}>
              {currentStock}
            </span>
            {isNegative ? " — minus (enter 0 or qty below to balance)" : ""}
          </span>
          {isNegative && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`shrink-0 ${wide ? "h-9 px-3 text-sm" : "h-7 px-2.5 text-[11px]"}`}
              onClick={() => set("openingStock", "0")}
            >
              Set 0
            </Button>
          )}
        </div>
      )}

      <div
        className={
          wide
            ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 w-full min-w-0"
            : "grid grid-cols-1 gap-3 w-full min-w-0"
        }
      >
        <Field
          label="Opening Stock"
          hint={
            mode === "edit"
              ? "Enter a number to set stock to that qty. Leave blank to keep current."
              : "Saved to inventory on create"
          }
        >
          <div className="flex items-center gap-2 w-full min-w-0">
            <Input
              type="number"
              min={0}
              step="0.001"
              inputMode="decimal"
              placeholder={mode === "edit" ? "Keep current" : "0"}
              value={values.openingStock}
              onChange={(e) => set("openingStock", e.target.value)}
              className={`${wide ? "h-11 text-base" : "h-10"} flex-1 min-w-0 w-full`}
            />
            {mode === "edit" && !isNegative && (
              <Button
                type="button"
                variant="outline"
                className={`${wide ? "h-11 px-4 text-sm" : "h-10 px-3 text-xs"} shrink-0`}
                onClick={() => set("openingStock", "0")}
              >
                Set 0
              </Button>
            )}
          </div>
        </Field>

        <Field label="Reorder Level">
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
            value={values.reorderLevel}
            onChange={(e) => set("reorderLevel", e.target.value)}
            className={`${wide ? "h-11 text-base" : "h-10"} w-full`}
          />
        </Field>

        <Field label="Minimum Stock">
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
            value={values.minStock}
            onChange={(e) => set("minStock", e.target.value)}
            className={`${wide ? "h-11 text-base" : "h-10"} w-full`}
          />
        </Field>

        <Field label="Maximum Stock">
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="0"
            value={values.maxStock}
            onChange={(e) => set("maxStock", e.target.value)}
            className={`${wide ? "h-11 text-base" : "h-10"} w-full`}
          />
        </Field>

        <Field label="Warehouse">
          <Select
            value={values.warehouseId || "_none"}
            onValueChange={(v) => set("warehouseId", v === "_none" ? "" : v)}
          >
            <SelectTrigger className={`${wide ? "h-11 text-base" : "h-10"} w-full`}>
              <SelectValue placeholder="Default warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Default / auto</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}
