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
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={opt.label}
          onClick={() => onChange(opt.id)}
          className={cn(
            "h-9 w-9 rounded-md border-2 transition-all hover:scale-105",
            value === opt.id ? "border-primary ring-2 ring-primary/30" : "border-border",
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
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
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
      {/* Floating cog — DreamsPOS style */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="theme-customizer-fab fixed z-[60] flex h-12 w-12 items-center justify-center rounded-l-xl bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        style={{ top: "50%", right: 0, transform: "translateY(-50%)" }}
        aria-label="Open theme customizer"
      >
        <Cog className="h-5 w-5 animate-spin" style={{ animationDuration: "3s" }} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          <SheetHeader className="bg-slate-900 text-white p-5 space-y-1 text-left">
            <SheetTitle className="text-white text-lg">Theme Customizer</SheetTitle>
            <SheetDescription className="text-slate-300">
              Choose your themes &amp; layouts
            </SheetDescription>
          </SheetHeader>

          <div className="p-4 space-y-4">
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
                      "flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-semibold transition-colors",
                      layout === item.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted",
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
                      "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                      width === item.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted",
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
                      "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-[11px] font-semibold",
                      theme === item.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted",
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
                      "h-9 w-9 rounded-full border-2 transition-transform hover:scale-105",
                      accent === preset.id ? "border-foreground ring-2 ring-primary/40" : "border-transparent",
                    )}
                    style={{ background: preset.hex }}
                  />
                ))}
              </div>
            </Section>

            <Button
              type="button"
              variant="outline"
              className="w-full"
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
