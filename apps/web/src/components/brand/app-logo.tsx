"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { APP_LOGO_DARK, APP_LOGO_LIGHT, APP_NAME, APP_TAGLINE } from "@/lib/constants";

type AppLogoVariant = "full" | "compact" | "sidebar";
/** dark = black bg logo, light = white bg logo, auto = follow app theme */
type LogoTheme = "dark" | "light" | "auto";

interface AppLogoProps {
  variant?: AppLogoVariant;
  /** Surface the logo sits on — picks matching logo background */
  theme?: LogoTheme;
  className?: string;
  alt?: string;
  showTagline?: boolean;
  /** When false, only swap light/dark logo — no outer background frame */
  framed?: boolean;
}

const HEIGHT: Record<AppLogoVariant, string> = {
  full: "h-14 sm:h-16",
  compact: "h-11 sm:h-12",
  sidebar: "h-9",
};

export function AppLogo({
  variant = "full",
  theme = "auto",
  className,
  alt = APP_NAME,
  showTagline = false,
  framed = true,
}: AppLogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const effectiveTheme: "dark" | "light" =
    theme === "auto"
      ? mounted && resolvedTheme === "dark"
        ? "dark"
        : "light"
      : theme;

  const src = effectiveTheme === "dark" ? APP_LOGO_DARK : APP_LOGO_LIGHT;

  const img = (
    <img
      src={src}
      alt={alt}
      className={cn(
        "w-auto max-w-[min(100%,280px)] object-contain object-left",
        framed && "px-2 py-1.5",
        HEIGHT[variant],
        !framed && "h-full w-full max-w-full object-contain p-0.5",
      )}
    />
  );

  return (
    <div className={cn("flex flex-col items-start", className)}>
      {framed ? (
        <div
          className={cn(
            "inline-flex rounded-xl overflow-hidden",
            effectiveTheme === "dark" ? "bg-[#070d1a]" : "bg-slate-50 border border-slate-200/80",
          )}
        >
          {img}
        </div>
      ) : (
        img
      )}
      {showTagline && variant === "full" && (
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.2em] mt-1.5",
            effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500",
          )}
        >
          {APP_TAGLINE}
        </p>
      )}
    </div>
  );
}

/** Logo src for places that render a plain img (e.g. POS bar). */
export function useAppLogoSrc(theme: LogoTheme = "auto"): string {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const effectiveTheme: "dark" | "light" =
    theme === "auto"
      ? mounted && resolvedTheme === "dark"
        ? "dark"
        : "light"
      : theme;

  return effectiveTheme === "dark" ? APP_LOGO_DARK : APP_LOGO_LIGHT;
}
