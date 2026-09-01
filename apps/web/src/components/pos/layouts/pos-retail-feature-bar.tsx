"use client";

import type { LucideIcon } from "lucide-react";
import type { PosLayoutId } from "@/lib/pos-layouts";
import { cn } from "@/lib/utils";

export type PosRetailNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type Props = {
  posLayout: PosLayoutId;
  items: PosRetailNavItem[];
  activeNav: string;
  cartCount: number;
  heldCount: number;
  onNavigate: (id: string) => void;
};

/** Retail layouts: horizontal access to every main POS module (same as sidebar). */
export function PosRetailFeatureBar({
  posLayout,
  items,
  activeNav,
  cartCount,
  heldCount,
  onNavigate,
}: Props) {
  if (posLayout === "classic") return null;

  return (
    <div
      className="pos-retail-feature-bar shrink-0 border-b px-2 py-1.5 overflow-x-auto scrollbar-none"
      style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
      aria-label="POS features"
    >
      <div className="flex items-center gap-1 min-w-max">
        {items.map((item) => {
          const active = activeNav === item.id || (item.id === "reload" && activeNav === "products");
          const badge =
            item.id === "products" && cartCount > 0
              ? cartCount
              : item.id === "hold-bills" && heldCount > 0
                ? heldCount
                : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all",
                active && "ring-1 ring-inset",
              )}
              style={{
                background: active ? "rgba(var(--pos-accent-rgb),0.18)" : "var(--pos-input)",
                color: active ? "var(--pos-accent)" : "var(--pos-text-secondary)",
                border: `1px solid ${active ? "rgba(var(--pos-accent-rgb),0.4)" : "var(--pos-border)"}`,
              }}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
              {badge > 0 && (
                <span
                  className="text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none min-w-[1.1rem] text-center"
                  style={{
                    background: item.id === "hold-bills" ? "var(--pos-warn)" : "var(--pos-accent)",
                    color: "#fff",
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
