"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CLOTHING_COLORS,
  CLOTHING_SIZE_GROUPS,
  clothingColorHex,
  type ClothingColorDef,
  type ClothingSizeGroup,
} from "@/lib/clothing-fashion";

export type ClothingMatrixVariant = {
  id?: string;
  size?: string;
  color?: string;
  sku?: string;
  barcode?: string;
  sellingPrice?: string | number;
  costPrice?: string | number;
  mrp?: string | number;
  stock?: number;
  name?: string;
  active?: boolean;
  key?: string;
};

/** Build Size × Color cartesian product, preserving existing row data when possible. */
export function buildCartesianClothingVariants(
  sizes: string[],
  colors: string[],
  existing: ClothingMatrixVariant[] = [],
  defaults?: { sellingPrice?: string; costPrice?: string; mrp?: string },
): ClothingMatrixVariant[] {
  const sizeList = sizes.map((s) => s.trim()).filter(Boolean);
  const colorList = colors.map((c) => c.trim()).filter(Boolean);
  if (!sizeList.length || !colorList.length) return [];

  const byKey = new Map<string, ClothingMatrixVariant>();
  for (const v of existing) {
    const size = (v.size ?? "").trim();
    const color = (v.color ?? "").trim();
    if (!size || !color) continue;
    byKey.set(`${color.toLowerCase()}|${size.toLowerCase()}`, v);
  }

  const out: ClothingMatrixVariant[] = [];
  for (const color of colorList) {
    for (const size of sizeList) {
      const prev = byKey.get(`${color.toLowerCase()}|${size.toLowerCase()}`);
      const name = `${size} / ${color}`;
      out.push({
        ...prev,
        key: prev?.key ?? prev?.id ?? `${color}|${size}`,
        size,
        color,
        name: prev?.name || name,
        sellingPrice: prev?.sellingPrice ?? defaults?.sellingPrice ?? "",
        costPrice: prev?.costPrice ?? defaults?.costPrice ?? "",
        mrp: prev?.mrp ?? defaults?.mrp ?? "",
        stock: prev?.stock ?? 0,
        active: prev?.active ?? true,
      });
    }
  }
  return out;
}

export function SizeGroupPicker({
  selectedGroupId,
  onSelectGroup,
  selectedSizes,
  onSizesChange,
  className,
}: {
  selectedGroupId?: string;
  onSelectGroup: (group: ClothingSizeGroup) => void;
  selectedSizes: string[];
  onSizesChange: (sizes: string[]) => void;
  className?: string;
}) {
  const active = CLOTHING_SIZE_GROUPS.find((g) => g.id === selectedGroupId) ?? CLOTHING_SIZE_GROUPS[0];

  const toggleSize = (size: string) => {
    if (selectedSizes.includes(size)) {
      onSizesChange(selectedSizes.filter((s) => s !== size));
    } else {
      onSizesChange([...selectedSizes, size]);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-semibold">Size group</Label>
      <div className="flex flex-wrap gap-1.5">
        {CLOTHING_SIZE_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              onSelectGroup(g);
              onSizesChange([...g.sizes]);
            }}
            className={cn(
              "h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors",
              active.id === g.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted/40",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {active.sizes.map((size) => {
          const on = selectedSizes.includes(size);
          return (
            <button
              key={size}
              type="button"
              onClick={() => toggleSize(size)}
              className={cn(
                "h-8 min-w-[2.25rem] rounded-md border px-2 text-xs font-semibold tabular-nums",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              {size}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ClothingColorChips({
  selectedColors,
  onChange,
  palette,
  className,
}: {
  selectedColors: string[];
  onChange: (colors: string[]) => void;
  palette?: ClothingColorDef[];
  className?: string;
}) {
  const [masterPalette, setMasterPalette] = React.useState<ClothingColorDef[] | null>(
    palette ?? null,
  );

  React.useEffect(() => {
    if (palette?.length) {
      setMasterPalette(palette);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { api } = await import("@/lib/api");
        const res = await api.get<
          { name: string; hex?: string; code?: string | null; isActive?: boolean }[]
        >("/clothing/colors");
        const rows = Array.isArray(res.data) ? res.data : [];
        const active = rows
          .filter((c) => c.isActive !== false)
          .map((c) => ({
            name: c.name,
            hex: c.hex || "#111827",
            code: c.code || undefined,
          }));
        if (!cancelled && active.length) setMasterPalette(active);
        else if (!cancelled) setMasterPalette(CLOTHING_COLORS);
      } catch {
        if (!cancelled) setMasterPalette(CLOTHING_COLORS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [palette]);

  const effective = masterPalette ?? CLOTHING_COLORS;

  const toggle = (name: string) => {
    if (selectedColors.includes(name)) {
      onChange(selectedColors.filter((c) => c !== name));
    } else {
      onChange([...selectedColors, name]);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-semibold">Colors</Label>
      <div className="flex flex-wrap gap-1.5">
        {effective.map((c) => {
          const on = selectedColors.includes(c.name);
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => toggle(c.name)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
                on ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border shrink-0"
                style={{ backgroundColor: c.hex }}
              />
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  sizes: string[];
  colors: string[];
  variants: ClothingMatrixVariant[];
  onChange: (variants: ClothingMatrixVariant[]) => void;
  showStock?: boolean;
  className?: string;
};

export function ClothingVariantMatrix({
  sizes,
  colors,
  variants,
  onChange,
  showStock = true,
  className,
}: Props) {
  const sizeList = sizes.map((s) => s.trim()).filter(Boolean);
  const colorList = colors.map((c) => c.trim()).filter(Boolean);

  const lookup = React.useMemo(() => {
    const map = new Map<string, ClothingMatrixVariant>();
    for (const v of variants) {
      const size = (v.size ?? "").trim();
      const color = (v.color ?? "").trim();
      if (!size || !color) continue;
      map.set(`${color.toLowerCase()}|${size.toLowerCase()}`, v);
    }
    return map;
  }, [variants]);

  const patchCell = (color: string, size: string, patch: Partial<ClothingMatrixVariant>) => {
    const key = `${color.toLowerCase()}|${size.toLowerCase()}`;
    const next = variants.map((v) => {
      const vk = `${(v.color ?? "").trim().toLowerCase()}|${(v.size ?? "").trim().toLowerCase()}`;
      if (vk !== key) return v;
      return { ...v, ...patch };
    });
    const exists = next.some((v) => {
      const vk = `${(v.color ?? "").trim().toLowerCase()}|${(v.size ?? "").trim().toLowerCase()}`;
      return vk === key;
    });
    if (!exists) {
      next.push({
        key: `${color}|${size}`,
        color,
        size,
        name: `${size} / ${color}`,
        sellingPrice: "",
        costPrice: "",
        stock: 0,
        active: true,
        ...patch,
      });
    }
    onChange(next);
  };

  if (!sizeList.length || !colorList.length) {
    return (
      <div className={cn("rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground", className)}>
        Pick a size group and at least one color to build the Size × Color matrix.
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground sticky left-0 bg-muted/40 z-10">
                Color \ Size
              </th>
              {sizeList.map((size) => (
                <th key={size} className="px-2 py-2.5 text-center font-semibold min-w-[7.5rem]">
                  {size}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {colorList.map((color) => {
              const hex = clothingColorHex(color);
              return (
                <tr key={color} className="hover:bg-muted/10">
                  <td className="px-3 py-2 font-medium sticky left-0 bg-card z-10">
                    <span className="inline-flex items-center gap-1.5">
                      {hex ? (
                        <span className="h-3.5 w-3.5 rounded-full border shrink-0" style={{ backgroundColor: hex }} />
                      ) : null}
                      {color}
                    </span>
                  </td>
                  {sizeList.map((size) => {
                    const cell = lookup.get(`${color.toLowerCase()}|${size.toLowerCase()}`);
                    return (
                      <td key={`${color}-${size}`} className="px-2 py-2 align-top">
                        <div className="space-y-1 min-w-[6.5rem]">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="Sell"
                            value={cell?.sellingPrice ?? ""}
                            onChange={(e) => patchCell(color, size, { sellingPrice: e.target.value })}
                            className="h-7 text-xs text-right tabular-nums"
                          />
                          {showStock ? (
                            <Input
                              type="number"
                              min={0}
                              step="1"
                              placeholder="Stock"
                              value={cell?.stock ?? ""}
                              onChange={(e) =>
                                patchCell(color, size, {
                                  stock: e.target.value === "" ? 0 : Number(e.target.value),
                                })
                              }
                              className="h-7 text-xs text-right tabular-nums"
                            />
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
        {colorList.length * sizeList.length} size × color combinations
      </div>
    </div>
  );
}
