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
      className="pos-retail-feature-bar shrink-0 border-b px-2 py-1.5 overflow-x-auto scrollbar-none"
      style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
      aria-label="POS features"
    >
      <div className="flex items-center gap-1 min-w-max">
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
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all hover:opacity-90",
                active && "ring-1 ring-inset shadow-sm",
              )}
              style={btnStyle}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
              {badge > 0 && (
                <span
                  className="text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none min-w-[1.1rem] text-center"
                  style={{
                    background: "var(--pos-accent)",
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
