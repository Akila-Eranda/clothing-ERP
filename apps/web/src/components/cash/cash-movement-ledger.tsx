"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Bot, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";

export interface CashMovement {
  id: string;
  type: string;
  amount: number;
  reference?: string | null;
  description?: string | null;
  createdAt: string;
}

const MOVEMENT_CFG: Record<string, { label: string; dir: "in" | "out" | "neutral"; auto?: boolean }> = {
  OPENING: { label: "Opening float", dir: "neutral" },
  SALE: { label: "POS cash sale", dir: "in", auto: true },
  DEPOSIT: { label: "Cash in", dir: "in" },
  PAYMENT: { label: "Payment received", dir: "in", auto: true },
  WITHDRAWAL: { label: "Cash out", dir: "out" },
  EXPENSE: { label: "Petty expense", dir: "out" },
  REFUND: { label: "Cash refund", dir: "out", auto: true },
};

interface CashMovementLedgerProps {
  movements: CashMovement[];
  limit?: number;
  emptyMessage?: string;
  className?: string;
}

export function CashMovementLedger({
  movements,
  limit,
  emptyMessage = "No movements yet",
  className,
}: CashMovementLedgerProps) {
  const rows = limit ? movements.slice(-limit).reverse() : [...movements].reverse();

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">{emptyMessage}</p>;
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {rows.map((m) => {
        const cfg = MOVEMENT_CFG[m.type] ?? { label: m.type, dir: "neutral" as const };
        const Icon = cfg.dir === "in" ? ArrowDownLeft : cfg.dir === "out" ? ArrowUpRight : CircleDot;
        return (
          <div
            key={m.id}
            className="flex items-center gap-3 p-3 rounded-xl border text-sm hover:bg-muted/30 transition-colors"
          >
            <div
              className={cn(
                "rounded-full p-1.5 shrink-0",
                cfg.dir === "in" && "bg-emerald-500/10 text-emerald-600",
                cfg.dir === "out" && "bg-red-500/10 text-red-600",
                cfg.dir === "neutral" && "bg-blue-500/10 text-blue-600",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium truncate">{m.description || cfg.label}</p>
                {cfg.auto && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5 border-emerald-500/40 text-emerald-600">
                    <Bot className="h-2.5 w-2.5" /> Auto
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {new Date(m.createdAt).toLocaleString("en-LK", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
                {m.reference ? ` · Ref ${m.reference.slice(0, 8)}…` : ""}
              </p>
            </div>
            <span
              className={cn(
                "font-bold tabular-nums shrink-0",
                cfg.dir === "in" && "text-emerald-600",
                cfg.dir === "out" && "text-red-600",
              )}
            >
              {cfg.dir === "out" ? "−" : cfg.dir === "in" ? "+" : ""}
              {formatNumber(m.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
