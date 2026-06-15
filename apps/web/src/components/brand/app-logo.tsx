"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { APP_LOGO_PATH, APP_NAME, APP_TAGLINE } from "@/lib/constants";

type AppLogoVariant = "full" | "compact" | "sidebar";

interface AppLogoProps {
  variant?: AppLogoVariant;
  className?: string;
  /** Screen-reader label when the image is decorative */
  alt?: string;
  /** Show tagline below logo (full variant only) */
  showTagline?: boolean;
}

const HEIGHT: Record<AppLogoVariant, number> = {
  full: 56,
  compact: 40,
  sidebar: 36,
};

export function AppLogo({
  variant = "full",
  className,
  alt = APP_NAME,
  showTagline = false,
}: AppLogoProps) {
  const height = HEIGHT[variant];

  return (
    <div className={cn("flex flex-col items-start", className)}>
      <Image
        src={APP_LOGO_PATH}
        alt={alt}
        width={280}
        height={height}
        priority
        className="w-auto object-contain object-left"
        style={{ height }}
      />
      {showTagline && variant === "full" && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 mt-1">
          {APP_TAGLINE}
        </p>
      )}
    </div>
  );
}
