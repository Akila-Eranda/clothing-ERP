import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Solid fills — white label + icon in light and dark themes. */
const solidWhite =
  "text-white [&_svg]:text-white hover:text-white hover:[&_svg]:text-white dark:text-white dark:[&_svg]:text-white dark:hover:text-white dark:hover:[&_svg]:text-white";

/**
 * App-wide button design system — the ONLY button module for dashboard / admin / hubs.
 *
 * Import: `import { Button } from "@/components/ui/button"`
 *
 * Prefer variants over one-off `className="bg-emerald-600 …"` overrides.
 * Exceptions: POS shell (`pos-overlay`) and print HTML keep local controls.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold leading-none transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-[var(--primary-glow)] disabled:pointer-events-none disabled:opacity-50 overflow-visible [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border shadow-sm hover:brightness-110 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: cn(
          solidWhite,
          "bg-blue-600 border-blue-700 hover:bg-blue-600 dark:bg-blue-600 dark:border-blue-500",
        ),
        outline: cn(
          solidWhite,
          "bg-indigo-600 border-indigo-700 hover:bg-indigo-600 dark:bg-indigo-600 dark:border-indigo-500",
        ),
        secondary: cn(
          solidWhite,
          "bg-slate-600 border-slate-700 hover:bg-slate-600 dark:bg-slate-600 dark:border-slate-500",
        ),
        ghost: cn(
          solidWhite,
          "bg-slate-500/90 border-slate-600 hover:bg-slate-600 dark:bg-slate-600 dark:border-slate-500",
        ),
        link: "font-medium text-primary underline-offset-4 hover:underline border-transparent shadow-none bg-transparent hover:brightness-100 active:scale-100",
        gradient: cn(
          solidWhite,
          "bg-blue-600 border-blue-700 hover:bg-blue-600 dark:bg-blue-600 dark:border-blue-500",
        ),
        success: cn(
          solidWhite,
          "bg-emerald-600 border-emerald-700 hover:bg-emerald-600 dark:bg-emerald-600 dark:border-emerald-500",
        ),
        warning: cn(
          solidWhite,
          "bg-orange-600 border-orange-700 hover:bg-orange-600 dark:bg-orange-600 dark:border-orange-500",
        ),
        danger: cn(
          solidWhite,
          "bg-rose-600 border-rose-700 hover:bg-rose-600 dark:bg-rose-600 dark:border-rose-500",
        ),
        destructive: cn(
          solidWhite,
          "bg-red-600 border-red-700 hover:bg-red-600 dark:bg-red-600 dark:border-red-500",
        ),
        info: cn(
          solidWhite,
          "bg-cyan-600 border-cyan-700 hover:bg-cyan-600 dark:bg-cyan-600 dark:border-cyan-500",
        ),
        violet: cn(
          solidWhite,
          "bg-violet-600 border-violet-700 hover:bg-violet-600 dark:bg-violet-600 dark:border-violet-500",
        ),
        /** Filter / date chips — unselected slate, selected = success elsewhere */
        chip: cn(
          solidWhite,
          "bg-slate-500 border-slate-600 hover:bg-slate-600 dark:bg-slate-600 dark:border-slate-500",
        ),
      },
      size: {
        default: "h-10 min-h-10 px-4 py-0",
        sm: "h-9 min-h-9 px-3 text-xs py-0",
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
