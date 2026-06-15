"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";

export const DEFAULT_DENOMINATIONS = [5000, 1000, 500, 100, 50, 20];

interface DenominationInputProps {
  value: Record<string, number>;
  onChange: (counts: Record<string, number>) => void;
  className?: string;
}

export function DenominationInput({ value, onChange, className }: DenominationInputProps) {
  const total = React.useMemo(
    () => Object.entries(value).reduce((s, [d, q]) => s + parseFloat(d) * (Number(q) || 0), 0),
    [value],
  );

  const setCount = (denom: number, qty: string) => {
    const n = Math.max(0, parseInt(qty, 10) || 0);
    onChange({ ...value, [String(denom)]: n });
  };

  return (
    <div className={className}>
      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Physical count</p>
      <div className="space-y-2">
        {DEFAULT_DENOMINATIONS.map((denom) => {
          const qty = value[String(denom)] ?? 0;
          const line = denom * qty;
          return (
            <div key={denom} className="flex items-center gap-2 text-sm">
              <span className="w-16 font-mono text-muted-foreground shrink-0">{denom.toLocaleString()}</span>
              <span className="text-muted-foreground">×</span>
              <Input
                type="number"
                min={0}
                className="h-8 w-20 text-center"
                value={qty || ""}
                placeholder="0"
                onChange={(e) => setCount(denom, e.target.value)}
              />
              <span className="text-muted-foreground">=</span>
              <span className="flex-1 text-right font-semibold tabular-nums">
                {line > 0 ? formatNumber(line) : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t flex items-center justify-between">
        <span className="text-sm font-semibold">Actual cash total</span>
        <span className="text-lg font-bold text-primary tabular-nums">LKR {formatNumber(total)}</span>
      </div>
    </div>
  );
}

export function denominationTotal(counts: Record<string, number>): number {
  return Object.entries(counts).reduce((s, [d, q]) => {
    const denom = parseFloat(d);
    const qty = Number(q) || 0;
    if (!Number.isFinite(denom) || denom <= 0 || qty <= 0) return s;
    return s + denom * qty;
  }, 0);
}
