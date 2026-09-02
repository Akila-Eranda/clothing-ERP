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
  login: "h-14 sm:h-16 md:h-[4.5rem]",
  hero: "h-11 sm:h-12 md:h-14",
  full: "h-16 sm:h-[4.5rem]",
  compact: "h-12 sm:h-14",
  sidebar: "",
};

const MAX_WIDTH: Record<AppLogoVariant, string> = {
  login: "max-w-[min(100%,280px)]",
  hero: "max-w-[min(100%,220px)]",
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
  const isSidebar = variant === "sidebar";
  const [imgSrc, setImgSrc] = React.useState(src);

  React.useEffect(() => {
    setImgSrc(mounted ? resolveLogoSrc(onDark) : APP_LOGO_PATH);
  }, [mounted, onDark]);

  const handleLogoError = () => {
    if (imgSrc !== APP_LOGO_PATH) setImgSrc(APP_LOGO_PATH);
  };

  return (
    <div className={cn("flex flex-col", isSidebar ? "items-center w-full" : "items-start", className)}>
      <img
        key={imgSrc}
        src={imgSrc}
        alt={alt}
        onError={handleLogoError}
        className={cn(
          isSidebar
            ? "hex-sidebar-logo block h-10 w-auto max-w-[calc(100%-2.5rem)] object-contain object-center mx-auto"
            : "w-auto object-contain object-left",
          !isSidebar && HEIGHT[variant],
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
