"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { APP_LOGO_PATH, APP_NAME, APP_TAGLINE } from "@/lib/constants";

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
  sidebar: "h-9",
};

const MAX_WIDTH: Record<AppLogoVariant, string> = {
  login: "max-w-[min(100%,560px)]",
  hero: "max-w-[min(100%,420px)]",
  full: "max-w-[min(100%,320px)]",
  compact: "max-w-[min(100%,280px)]",
  sidebar: "max-w-[min(100%,200px)]",
};

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

  return (
    <div className={cn("flex flex-col items-start", className)}>
      <img
        src={APP_LOGO_PATH}
        alt={alt}
        className={cn(
          "w-auto object-contain object-center",
          HEIGHT[variant],
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

export function useAppLogoSrc() {
  return APP_LOGO_PATH;
}
