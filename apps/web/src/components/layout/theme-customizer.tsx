"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Check,
  ChevronDown,
  Cog,
  LayoutGrid,
  Layers,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  RotateCcw,
  Sparkles,
  Sun,
  Laptop,
  X,
  type LucideIcon,
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
import { ACCENT_PRESETS, type AccentId } from "@/lib/accent-theme";
import {
  SIDEBAR_SKIN_SWATCHES,
  TOPBAR_SKIN_SWATCHES,
  type LayoutMode,
  type LayoutWidth,
  type SidebarSkin,
  type TopbarSkin,
} from "@/lib/theme-layout";
import type { DarkAccentChoice, LightAccentChoice } from "@/lib/theme-colors";
import { useThemeLayoutStore } from "@/stores/theme-layout-store";
import { useThemeColorsStore } from "@/stores/theme-colors-store";
import { useUIStore } from "@/stores/ui-store";

type CustomizerTab = "general" | "colors" | "layout";

const TABS: { id: CustomizerTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: Sparkles },
  { id: "colors", label: "Colors", icon: Palette },
  { id: "layout", label: "Layout", icon: Layers },
];

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
    <div className="tc-swatch-grid">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={opt.label}
          onClick={() => onChange(opt.id)}
          className={cn("tc-swatch", value === opt.id && "tc-swatch--active")}
          style={{ background: opt.css }}
        >
          {value === opt.id && (
            <span className="tc-swatch__check">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  icon: Icon,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cn("tc-section", open && "tc-section--open")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="tc-section__trigger"
      >
        <div className="tc-section__leading">
          {Icon && (
            <span className="tc-section__icon">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h3 className="tc-section__title">{title}</h3>
              {badge && <span className="tc-section__badge">{badge}</span>}
            </div>
            {description && (
              <p className="tc-section__desc">{description}</p>
            )}
          </div>
        </div>
        <ChevronDown className={cn("tc-section__chevron", open && "tc-section__chevron--open")} />
      </button>
      <div className={cn("tc-section__body", open && "tc-section__body--open")}>
        <div className="tc-section__inner">{children}</div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#000000";
  return (
    <div className="tc-color-field">
      <label className="tc-color-field__label">
        <span className="tc-color-field__dot" style={{ background: safe }} />
        {label}
      </label>
      <div className="tc-color-field__controls">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="tc-color-field__picker"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="tc-color-field__hex"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function AccentSwatches({
  value,
  customHex,
  onPick,
  onCustom,
  extra,
}: {
  value: LightAccentChoice | DarkAccentChoice;
  customHex: string;
  onPick: (id: AccentId) => void;
  onCustom: (hex: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="tc-accent-row">
        {ACCENT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.name}
            onClick={() => onPick(preset.id)}
            className={cn("tc-accent-dot", value === preset.id && "tc-accent-dot--active")}
            style={{ background: preset.hex }}
          >
            {value === preset.id && <Check className="h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />}
          </button>
        ))}
        <label
          className={cn("tc-accent-dot tc-accent-dot--custom", value === "custom" && "tc-accent-dot--active")}
          title="Custom color"
        >
          <span className="absolute inset-0 rounded-full" style={{ background: customHex }} />
          {value === "custom" && <Check className="relative z-[1] h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />}
          <input
            type="color"
            value={customHex}
            onChange={(e) => onCustom(e.target.value.toUpperCase())}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>
      {extra}
    </div>
  );
}

function OptionCard({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("tc-option-card", active && "tc-option-card--active")}
    >
      {Icon && <Icon className="h-5 w-5" />}
      <span>{label}</span>
      {active && (
        <span className="tc-option-card__tick">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function resolveAccentHex(
  colors: ReturnType<typeof useThemeColorsStore.getState>,
  isDark: boolean,
): string {
  if (isDark) {
    if (colors.darkAccent === "match-light") {
      if (colors.lightAccent === "custom") return colors.customLightAccent;
      return ACCENT_PRESETS.find((p) => p.id === colors.lightAccent)?.hex ?? colors.customLightAccent;
    }
    if (colors.darkAccent === "custom") return colors.customDarkAccent;
    return ACCENT_PRESETS.find((p) => p.id === colors.darkAccent)?.hex ?? colors.customDarkAccent;
  }
  if (colors.lightAccent === "custom") return colors.customLightAccent;
  return ACCENT_PRESETS.find((p) => p.id === colors.lightAccent)?.hex ?? colors.customLightAccent;
}

function ThemePreviewStrip({ isDark }: { isDark: boolean }) {
  const colors = useThemeColorsStore();
  const bg = isDark ? colors.darkBackground : colors.lightBackground;
  const card = isDark ? colors.darkCard : colors.lightCard;
  const accent = resolveAccentHex(colors, isDark);
  const fg = isDark ? colors.darkForeground : colors.lightForeground;

  return (
    <div className="tc-preview">
      <div className="tc-preview__frame" style={{ background: bg }}>
        <div className="tc-preview__sidebar" style={{ background: isDark ? colors.darkChromeBg : "#F1F5F9" }} />
        <div className="tc-preview__main">
          <div className="tc-preview__topbar" style={{ background: card, borderColor: isDark ? colors.darkBorder : colors.lightBorder }} />
          <div className="tc-preview__card" style={{ background: card, borderColor: isDark ? colors.darkBorder : colors.lightBorder }}>
            <span style={{ color: fg }}>Aa</span>
            <span className="tc-preview__pill" style={{ background: accent }} />
          </div>
        </div>
      </div>
      <div className="tc-preview__chips">
        <span className="tc-preview__chip" style={{ background: bg }} title="Background" />
        <span className="tc-preview__chip" style={{ background: card }} title="Card" />
        <span className="tc-preview__chip tc-preview__chip--accent" style={{ background: accent }} title="Accent" />
      </div>
    </div>
  );
}

export function ThemeCustomizer() {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<CustomizerTab>("general");
  const { theme, setTheme, resolvedTheme } = useTheme();
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
    reset: resetLayout,
  } = useThemeLayoutStore();

  const colors = useThemeColorsStore();
  const {
    lightAccent,
    customLightAccent,
    darkAccent,
    customDarkAccent,
    setLightAccent,
    setCustomLightAccent,
    setDarkAccent,
    setCustomDarkAccent,
    setColor,
    reset: resetColors,
  } = colors;

  const isDark = resolvedTheme === "dark";

  const pickLayout = (mode: LayoutMode) => {
    setLayout(mode);
    setSidebarCollapsed(mode === "mini");
  };

  const handleReset = () => {
    resetLayout();
    resetColors();
    setSidebarCollapsed(false);
    setTheme("light");
    setTab("general");
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
        <SheetContent
          side="right"
          className="theme-customizer-panel w-full sm:max-w-[440px] overflow-hidden p-0 border-l-0 gap-0 [&>button.absolute]:hidden"
        >
          <SheetHeader className="theme-customizer-header relative shrink-0 overflow-hidden p-0 text-left space-y-0">
            <div className="theme-customizer-header__glow" aria-hidden />
            <div className="theme-customizer-header__glow theme-customizer-header__glow--left" aria-hidden />

            <div className="relative px-5 pt-5 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="tc-header-icon">
                    <Palette className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <SheetTitle className="text-white text-lg font-bold tracking-tight">
                      Theme Customizer
                    </SheetTitle>
                    <SheetDescription className="text-slate-300/85 text-xs mt-0.5 leading-relaxed">
                      Personalize colors, layout &amp; appearance
                    </SheetDescription>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="tc-header-close"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <ThemePreviewStrip isDark={isDark} />
            </div>

            <div className="tc-tabs" role="tablist">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={cn("tc-tab", tab === item.id && "tc-tab--active")}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </div>
          </SheetHeader>

          <div className="tc-body">
            {tab === "general" && (
              <div className="tc-panel">
                <Section title="Theme Mode" description="Choose light, dark or system" icon={Sun} defaultOpen>
                  <div className="tc-segment">
                    {([
                      { id: "light", label: "Light", icon: Sun },
                      { id: "dark", label: "Dark", icon: Moon },
                      { id: "system", label: "Auto", icon: Laptop },
                    ] as const).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTheme(item.id)}
                        className={cn("tc-segment__btn", theme === item.id && "tc-segment__btn--active")}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </Section>

                <Section title="Sidebar Layout" description="Default or compact mini sidebar" icon={PanelLeft}>
                  <div className="grid grid-cols-2 gap-2.5">
                    <OptionCard active={layout === "default"} onClick={() => pickLayout("default")} icon={LayoutGrid} label="Default" />
                    <OptionCard active={layout === "mini"} onClick={() => pickLayout("mini")} icon={Monitor} label="Mini" />
                  </div>
                </Section>

                <Section title="Content Width" description="Fluid full-width or boxed container" icon={Layers} defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-2.5">
                    <OptionCard active={width === "fluid"} onClick={() => setWidth("fluid")} label="Fluid" />
                    <OptionCard active={width === "box"} onClick={() => setWidth("box")} label="Boxed" />
                  </div>
                </Section>
              </div>
            )}

            {tab === "colors" && (
              <div className="tc-panel">
                <Section title="Brand — Light" description="Primary accent for light mode" icon={Sun} badge="Light">
                  <AccentSwatches
                    value={lightAccent}
                    customHex={customLightAccent}
                    onPick={setLightAccent}
                    onCustom={setCustomLightAccent}
                  />
                </Section>

                <Section title="Brand — Dark" description="Primary accent for dark mode" icon={Moon} badge="Dark">
                  <AccentSwatches
                    value={darkAccent}
                    customHex={customDarkAccent}
                    onPick={(id) => setDarkAccent(id)}
                    onCustom={setCustomDarkAccent}
                    extra={(
                      <button
                        type="button"
                        onClick={() => setDarkAccent("match-light")}
                        className={cn("tc-match-btn", darkAccent === "match-light" && "tc-match-btn--active")}
                      >
                        <Check className={cn("h-3.5 w-3.5", darkAccent !== "match-light" && "opacity-0")} />
                        Use same as light mode
                      </button>
                    )}
                  />
                </Section>

                <Section title="Light Surfaces" description="Page, cards & text colors" icon={Sun} defaultOpen={false}>
                  <div className="tc-color-list">
                    <ColorField label="Page background" value={colors.lightBackground} onChange={(v) => setColor("lightBackground", v)} />
                    <ColorField label="Card / panel" value={colors.lightCard} onChange={(v) => setColor("lightCard", v)} />
                    <ColorField label="Text" value={colors.lightForeground} onChange={(v) => setColor("lightForeground", v)} />
                    <ColorField label="Border" value={colors.lightBorder} onChange={(v) => setColor("lightBorder", v)} />
                    <ColorField label="Muted text" value={colors.lightMutedForeground} onChange={(v) => setColor("lightMutedForeground", v)} />
                  </div>
                </Section>

                <Section title="Dark Surfaces" description="Page, cards & text colors" icon={Moon} defaultOpen={false}>
                  <div className="tc-color-list">
                    <ColorField label="Page background" value={colors.darkBackground} onChange={(v) => setColor("darkBackground", v)} />
                    <ColorField label="Card / panel" value={colors.darkCard} onChange={(v) => setColor("darkCard", v)} />
                    <ColorField label="Text" value={colors.darkForeground} onChange={(v) => setColor("darkForeground", v)} />
                    <ColorField label="Border" value={colors.darkBorder} onChange={(v) => setColor("darkBorder", v)} />
                    <ColorField label="Muted text" value={colors.darkMutedForeground} onChange={(v) => setColor("darkMutedForeground", v)} />
                  </div>
                </Section>

                <Section title="Sidebar & Header" description="Dark chrome navigation colors" icon={PanelLeft} defaultOpen={false}>
                  <div className="tc-color-list">
                    <ColorField label="Background" value={colors.darkChromeBg} onChange={(v) => setColor("darkChromeBg", v)} />
                    <ColorField label="Text" value={colors.darkChromeFg} onChange={(v) => setColor("darkChromeFg", v)} />
                    <ColorField label="Border" value={colors.darkChromeBorder} onChange={(v) => setColor("darkChromeBorder", v)} />
                    <ColorField label="Muted text" value={colors.darkChromeMuted} onChange={(v) => setColor("darkChromeMuted", v)} />
                    <ColorField label="Active / accent" value={colors.darkChromeActive} onChange={(v) => setColor("darkChromeActive", v)} />
                    <ColorField label="Logo area" value={colors.darkChromeLogoBg} onChange={(v) => setColor("darkChromeLogoBg", v)} />
                  </div>
                </Section>
              </div>
            )}

            {tab === "layout" && (
              <div className="tc-panel">
                <Section title="Top Bar" description="Header background style" icon={Monitor} defaultOpen>
                  <SwatchGrid<TopbarSkin>
                    value={topbarSkin}
                    options={TOPBAR_SKIN_SWATCHES}
                    onChange={setTopbarSkin}
                  />
                </Section>

                <Section title="Sidebar" description="Navigation panel style" icon={PanelLeft}>
                  <SwatchGrid<SidebarSkin>
                    value={sidebarSkin}
                    options={SIDEBAR_SKIN_SWATCHES}
                    onChange={setSidebarSkin}
                  />
                </Section>
              </div>
            )}
          </div>

          <div className="tc-footer">
            <Button
              type="button"
              variant="outline"
              className="tc-reset-btn"
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4" />
              Reset to defaults
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
