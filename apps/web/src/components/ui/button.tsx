import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Solid fills — white label + icon in light and dark themes. */
const solidWhite =
  "text-white [&_svg]:text-white hover:text-white hover:[&_svg]:text-white dark:text-white dark:[&_svg]:text-white dark:hover:text-white dark:hover:[&_svg]:text-white";

/** DreamsPOS retail palette — orange primary CTAs; neutral secondary in dark mode. */
const dreamsOrange = "bg-[#fe9f43] hover:bg-[#fe9f43] dark:bg-[#fe9f43] dark:hover:bg-[#fe9f43]";
const dreamsNavy = "bg-[#092c4c] hover:bg-[#092c4c] dark:bg-[hsl(var(--card))] dark:hover:bg-[hsl(var(--muted))] dark:border dark:border-border";

/**
 * App-wide button design system — the ONLY button module for dashboard / admin / hubs.
 *
 * Import: `import { Button } from "@/components/ui/button"`
 *
 * Prefer variants over one-off `className="bg-emerald-600 …"` overrides.
 * Exceptions: POS shell (`pos-overlay`) and print HTML keep local controls.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[5px] text-sm font-semibold leading-none transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fe9f43]/35 disabled:pointer-events-none disabled:opacity-50 overflow-visible [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border-0 shadow-none hover:brightness-105 active:scale-[0.98]",
  {
    variants: {
      variant: {
        /** Primary CTA — Add New, Save, Create */
        default: cn(solidWhite, dreamsOrange),
        /** POS Terminal — navy */
        pos: cn(solidWhite, dreamsNavy),
        /** Secondary — Refresh, filters, View */
        outline: cn(solidWhite, dreamsNavy),
        secondary: cn(
          solidWhite,
          "bg-[#1e3a5f] hover:bg-[#1e3a5f] dark:bg-[hsl(var(--card))] dark:hover:bg-[hsl(var(--muted))] dark:text-foreground dark:[&_svg]:text-foreground",
        ),
        ghost: cn(
          solidWhite,
          "bg-[#092c4c]/85 hover:bg-[#092c4c] dark:bg-[hsl(var(--card))] dark:hover:bg-[hsl(var(--muted))] dark:text-foreground dark:[&_svg]:text-foreground",
        ),
        link: "font-medium text-primary underline-offset-4 hover:underline border-transparent shadow-none bg-transparent hover:brightness-100 active:scale-100",
        gradient: cn(solidWhite, dreamsOrange),
        success: cn(
          solidWhite,
          "bg-[#3eb780] hover:bg-[#3eb780] dark:bg-[#3eb780] dark:hover:bg-[#3eb780]",
        ),
        warning: cn(solidWhite, dreamsOrange),
        danger: cn(
          solidWhite,
          "bg-[#e04f16] hover:bg-[#e04f16] dark:bg-[#e04f16] dark:hover:bg-[#e04f16]",
        ),
        destructive: cn(
          solidWhite,
          "bg-red-600 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-600",
        ),
        info: cn(
          solidWhite,
          "bg-[#155eef] hover:bg-[#155eef] dark:bg-[#155eef] dark:hover:bg-[#155eef]",
        ),
        violet: cn(
          solidWhite,
          "bg-violet-600 hover:bg-violet-600 dark:bg-violet-600 dark:hover:bg-violet-600",
        ),
        chip: cn(
          solidWhite,
          "bg-[#646b72] hover:bg-[#092c4c] dark:bg-[#646b72] dark:hover:bg-[#092c4c]",
        ),
      },
      size: {
        default: "h-10 min-h-10 px-4 py-0",
        sm: "h-9 min-h-9 px-3.5 text-xs py-0",
        lg: "h-11 min-h-11 px-6 text-base py-0",
        xl: "h-12 min-h-12 px-8 text-base font-semibold py-0",
        icon: "h-10 w-10 min-h-10",
        "icon-sm": "h-9 w-9 min-h-9",
        "icon-lg": "h-11 w-11 min-h-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
