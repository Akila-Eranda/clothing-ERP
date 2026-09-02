"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  APP_LOGO_DARK_PATH,
  APP_LOGO_LIGHT_PATH,
  APP_LOGO_PATH,
  APP_NAME,
  APP_TAGLINE,
} from "@/lib/constants";

type AppLogoVariant = "login" | "hero" | "full" | "compact" | "sidebar";
type LogoTheme = "dark" | "light" | "auto";

interface AppLogoProps {
  variant?: AppLogoVariant;
  /** Used for tagline text colour when showTagline is true */
  theme?: LogoTheme;
  className?: string;
  alt?: string;
  showTagline?: boolean;
}

const HEIGHT: Record<AppLogoVariant, string> = {
  login: "h-28 sm:h-32 md:h-36 lg:h-40",
  hero: "h-20 sm:h-24 md:h-28",
  full: "h-16 sm:h-[4.5rem]",
  compact: "h-12 sm:h-14",
  sidebar: "",
};

const MAX_WIDTH: Record<AppLogoVariant, string> = {
  login: "max-w-[min(100%,560px)]",
  hero: "max-w-[min(100%,420px)]",
  full: "max-w-[min(100%,320px)]",
  compact: "max-w-[min(100%,280px)]",
  sidebar: "max-w-full",
};

function resolveLogoSrc(onDark: boolean) {
  return onDark ? APP_LOGO_DARK_PATH : APP_LOGO_LIGHT_PATH;
}

export function AppLogo({
  variant = "full",
  theme = "auto",
  className,
  alt = APP_NAME,
  showTagline = false,
}: AppLogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const onDark =
    theme === "dark" || (theme === "auto" && mounted && resolvedTheme === "dark");

  const src = mounted ? resolveLogoSrc(onDark) : APP_LOGO_PATH;

  return (
    <div className={cn("flex flex-col items-start", className)}>
      <img
        src={src}
        alt={alt}
        className={cn(
          variant === "sidebar"
            ? "h-auto w-full max-h-[120px] min-h-[96px] object-contain object-center mix-blend-screen"
            : "w-auto object-contain object-left",
          variant !== "sidebar" && HEIGHT[variant],
          MAX_WIDTH[variant],
        )}
      />
      {showTagline && variant === "full" && (
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.2em] mt-2",
            onDark ? "text-slate-400" : "text-slate-500",
          )}
        >
          {APP_TAGLINE}
        </p>
      )}
    </div>
  );
}

export function useAppLogoSrc(theme: LogoTheme = "auto") {
  const { resolvedTheme } = useTheme();
  const onDark =
    theme === "dark" || (theme === "auto" && resolvedTheme === "dark");
  return resolveLogoSrc(onDark);
}
