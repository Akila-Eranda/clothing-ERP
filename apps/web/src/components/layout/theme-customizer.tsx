"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Cog, LayoutGrid, Monitor, Moon, RotateCcw, Sun, Laptop,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCENT_PRESETS,
  loadStoredAccent,
  persistAccent,
  type AccentId,
} from "@/lib/accent-theme";
import {
  SIDEBAR_SKIN_SWATCHES,
  TOPBAR_SKIN_SWATCHES,
  type LayoutMode,
  type LayoutWidth,
  type SidebarSkin,
  type TopbarSkin,
} from "@/lib/theme-layout";
import { useThemeLayoutStore } from "@/stores/theme-layout-store";
import { useUIStore } from "@/stores/ui-store";

function SwatchGrid<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; css: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={opt.label}
          onClick={() => onChange(opt.id)}
          className={cn(
            "theme-customizer-swatch h-9 w-9 rounded-lg border-2 transition-all duration-200",
            value === opt.id
              ? "border-primary scale-110 shadow-md ring-2 ring-primary/25"
              : "border-border/80 hover:scale-105 hover:border-primary/40",
          )}
          style={{ background: opt.css }}
        />
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="theme-customizer-section rounded-2xl border border-border/60 bg-card/80 p-4 space-y-3 shadow-sm">
      <h3 className="text-[13px] font-bold tracking-wide text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function ThemeCustomizer() {
  const [open, setOpen] = React.useState(false);
  const [accent, setAccent] = React.useState<AccentId>("blue");
  const { theme, setTheme } = useTheme();
  const { setSidebarCollapsed } = useUIStore();
  const {
    layout,
    width,
    sidebarSkin,
    topbarSkin,
    setLayout,
    setWidth,
    setSidebarSkin,
    setTopbarSkin,
    reset,
  } = useThemeLayoutStore();

  React.useEffect(() => {
    setAccent(loadStoredAccent());
  }, [open]);

  const pickLayout = (mode: LayoutMode) => {
    setLayout(mode);
    setSidebarCollapsed(mode === "mini");
  };

  const pickAccent = (id: AccentId) => {
    setAccent(id);
    persistAccent(id);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="theme-customizer-fab group"
        aria-label="Open theme customizer"
      >
        <span className="theme-customizer-fab__ring" aria-hidden />
        <span className="theme-customizer-fab__btn">
          <Cog className="theme-customizer-fab__icon h-5 w-5" />
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="theme-customizer-panel w-full sm:max-w-[420px] overflow-y-auto p-0 border-l-0">
          <SheetHeader className="theme-customizer-header relative overflow-hidden p-6 pb-5 text-left space-y-1">
            <div className="theme-customizer-header__glow" aria-hidden />
            <SheetTitle className="relative text-white text-xl font-bold tracking-tight">
              Theme Customizer
            </SheetTitle>
            <SheetDescription className="relative text-slate-300/90 text-sm">
              Choose your themes &amp; layouts
            </SheetDescription>
          </SheetHeader>

          <div className="p-4 pb-6 space-y-4 bg-muted/20">
            <Section title="Select Layout">
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "default" as const, label: "Default", icon: LayoutGrid },
                  { id: "mini" as const, label: "Mini", icon: Monitor },
                ]).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pickLayout(item.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border p-3.5 text-xs font-semibold transition-all duration-200",
                      layout === item.id
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border/70 bg-background hover:border-primary/30 hover:bg-muted/60",
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Layout Width">
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "fluid" as const, label: "Fluid" },
                  { id: "box" as const, label: "Boxed" },
                ]).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setWidth(item.id as LayoutWidth)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all duration-200",
                      width === item.id
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border/70 bg-background hover:border-primary/30 hover:bg-muted/60",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Top Bar Color">
              <SwatchGrid<TopbarSkin>
                value={topbarSkin}
                options={TOPBAR_SKIN_SWATCHES}
                onChange={setTopbarSkin}
              />
            </Section>

            <Section title="Sidebar Color">
              <SwatchGrid<SidebarSkin>
                value={sidebarSkin}
                options={SIDEBAR_SKIN_SWATCHES}
                onChange={setSidebarSkin}
              />
            </Section>

            <Section title="Theme Mode">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "light", label: "Light", icon: Sun },
                  { id: "dark", label: "Dark", icon: Moon },
                  { id: "system", label: "System", icon: Laptop },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTheme(item.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-semibold transition-all duration-200",
                      theme === item.id
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border/70 bg-background hover:border-primary/30 hover:bg-muted/60",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Theme Colors">
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.name}
                    onClick={() => pickAccent(preset.id)}
                    className={cn(
                      "h-10 w-10 rounded-full border-2 transition-all duration-200 shadow-sm",
                      accent === preset.id
                        ? "border-foreground scale-110 ring-2 ring-primary/35 shadow-md"
                        : "border-white/20 hover:scale-105",
                    )}
                    style={{ background: preset.hex }}
                  />
                ))}
              </div>
            </Section>

            <Button
              type="button"
              variant="outline"
              className="w-full h-11 rounded-xl border-dashed"
              onClick={() => {
                reset();
                setSidebarCollapsed(false);
                setTheme("light");
                pickAccent("blue");
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to defaults
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
