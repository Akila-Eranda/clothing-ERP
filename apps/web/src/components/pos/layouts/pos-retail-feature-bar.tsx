"use client";

import type { LucideIcon } from "lucide-react";
import type { PosLayoutId } from "@/lib/pos-layouts";
import { posToolbarBtnStyle } from "@/lib/pos-toolbar-colors";
import { cn } from "@/lib/utils";

export type PosRetailNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type Props = {
  posLayout: PosLayoutId;
  lightUi: boolean;
  items: PosRetailNavItem[];
  activeNav: string;
  cartCount: number;
  heldCount: number;
  onNavigate: (id: string) => void;
};

/** Retail layouts: horizontal access to every main POS module (same as sidebar). */
export function PosRetailFeatureBar({
  posLayout,
  lightUi,
  items,
  activeNav,
  cartCount,
  heldCount,
  onNavigate,
}: Props) {
  if (posLayout === "classic") return null;

  const uiMode = lightUi ? "light" : "dark";

  return (
    <div
      className="pos-retail-feature-bar shrink-0 border-b px-2.5 py-2 overflow-x-auto scrollbar-none"
      style={{
        background: lightUi ? "var(--pos-panel)" : "#0b1120",
        borderColor: "var(--pos-border)",
      }}
      aria-label="POS features"
    >
      <div className="flex items-center gap-1.5 min-w-max">
        {items.map((item) => {
          const active = activeNav === item.id;
          const badge =
            item.id === "products" && cartCount > 0
              ? cartCount
              : item.id === "hold-bills" && heldCount > 0
                ? heldCount
                : 0;
          const btnStyle = posToolbarBtnStyle(item.id, uiMode, active);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cn(
                "pos-retail-feature-btn flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                "hover:brightness-110 active:scale-[0.98]",
                active && "ring-2 ring-white/25 shadow-md",
              )}
              style={{ ...btnStyle, color: "#ffffff" }}
            >
              <item.icon
                className="h-4 w-4 shrink-0"
                strokeWidth={2.25}
                style={{ color: "#ffffff", stroke: "currentColor" }}
              />
              <span style={{ color: "#ffffff" }}>{item.label}</span>
              {badge > 0 && (
                <span
                  className="text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none min-w-[1.25rem] text-center"
                  style={{
                    background: "rgba(15, 23, 42, 0.45)",
                    color: "#ffffff",
                    border: "1px solid rgba(255,255,255,0.2)",
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
