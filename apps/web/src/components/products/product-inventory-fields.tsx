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
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p> : null}
    </div>
  );
}

export function ProductInventoryFields({
  values,
  onChange,
  mode = "create",
  currentStock,
}: {
  values: ProductInventoryValues;
  onChange: (patch: Partial<ProductInventoryValues>) => void;
  mode?: "create" | "edit";
  /** Total on-hand across variants (edit). Shown when negative so user can balance. */
  currentStock?: number | null;
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Field
        label="Opening Stock"
        hint={
          mode === "edit"
            ? "Enter a number to set stock to that qty (use 0 to clear minus). Leave blank to keep current."
            : "Saved to inventory on create"
        }
      >
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            step="0.001"
            placeholder={mode === "edit" ? "Keep current" : "0"}
            value={values.openingStock}
            onChange={(e) => set("openingStock", e.target.value)}
            className="h-10"
          />
          {mode === "edit" && (
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 px-3 text-xs"
              onClick={() => set("openingStock", "0")}
            >
              Set 0
            </Button>
          )}
        </div>
        {mode === "edit" && typeof currentStock === "number" && (
          <p className={`text-[11px] mt-1 ${isNegative ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
            Current stock: {currentStock}
            {isNegative ? " (minus — enter 0 or qty to balance)" : ""}
          </p>
        )}
      </Field>
      <Field label="Reorder Level">
        <Input
          type="number"
          min={0}
          placeholder="0"
          value={values.reorderLevel}
          onChange={(e) => set("reorderLevel", e.target.value)}
          className="h-10"
        />
      </Field>
      <Field label="Minimum Stock">
        <Input
          type="number"
          min={0}
          placeholder="0"
          value={values.minStock}
          onChange={(e) => set("minStock", e.target.value)}
          className="h-10"
        />
      </Field>
      <Field label="Maximum Stock">
        <Input
          type="number"
          min={0}
          placeholder="0"
          value={values.maxStock}
          onChange={(e) => set("maxStock", e.target.value)}
          className="h-10"
        />
      </Field>
      <Field label="Warehouse">
        <Select
          value={values.warehouseId || "_none"}
          onValueChange={(v) => set("warehouseId", v === "_none" ? "" : v)}
        >
          <SelectTrigger className="h-10">
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
  );
}
