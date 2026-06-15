"use client";

import { cn } from "@/lib/utils";
import { APP_LOGO_PATH, APP_NAME, APP_TAGLINE } from "@/lib/constants";

type AppLogoVariant = "full" | "compact" | "sidebar";

interface AppLogoProps {
  variant?: AppLogoVariant;
  className?: string;
  alt?: string;
  showTagline?: boolean;
}

const HEIGHT: Record<AppLogoVariant, string> = {
  full: "h-14 sm:h-16",
  compact: "h-11 sm:h-12",
  sidebar: "h-9",
};

export function AppLogo({
  variant = "full",
  className,
  alt = APP_NAME,
  showTagline = false,
}: AppLogoProps) {
  return (
    <div className={cn("flex flex-col items-start", className)}>
      <img
        src={APP_LOGO_PATH}
        alt={alt}
        className={cn("w-auto max-w-[min(100%,280px)] object-contain object-left", HEIGHT[variant])}
      />
      {showTagline && variant === "full" && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 mt-1.5">
          {APP_TAGLINE}
        </p>
      )}
    </div>
  );
}
