import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Solid fills — white label + icon in light and dark themes. */
const solidWhite =
  "text-white [&_svg]:text-white hover:text-white hover:[&_svg]:text-white dark:text-white dark:[&_svg]:text-white dark:hover:text-white dark:hover:[&_svg]:text-white";

const btnPrimary =
  "bg-[hsl(var(--btn-primary))] hover:bg-[hsl(var(--btn-primary-hover))] dark:bg-[hsl(var(--btn-primary))] dark:hover:bg-[hsl(var(--btn-primary-hover))]";

const btnSecondary =
  "bg-[hsl(var(--btn-secondary))] hover:bg-[hsl(var(--btn-secondary-hover))] dark:bg-[hsl(var(--btn-secondary))] dark:hover:bg-[hsl(var(--btn-secondary-hover))]";

const btnSuccess =
  "bg-[hsl(var(--btn-success))] hover:bg-[hsl(var(--btn-success))] dark:bg-[hsl(var(--btn-success))] dark:hover:bg-[hsl(var(--btn-success))]";

const btnDanger =
  "bg-[hsl(var(--btn-danger))] hover:bg-[hsl(var(--btn-danger))] dark:bg-[hsl(var(--btn-danger))] dark:hover:bg-[hsl(var(--btn-danger))]";

const btnDestructive =
  "bg-[hsl(var(--btn-destructive))] hover:bg-[hsl(var(--btn-destructive))] dark:bg-[hsl(var(--btn-destructive))] dark:hover:bg-[hsl(var(--btn-destructive))]";

const btnInfo =
  "bg-[hsl(var(--btn-info))] hover:bg-[hsl(var(--btn-info))] dark:bg-[hsl(var(--btn-info))] dark:hover:bg-[hsl(var(--btn-info))]";

const btnWarning =
  "bg-[hsl(var(--btn-warning))] hover:bg-[hsl(var(--btn-warning))] dark:bg-[hsl(var(--btn-warning))] dark:hover:bg-[hsl(var(--btn-warning))]";

/**
 * App-wide button design system — the ONLY button module for dashboard / admin / hubs.
 * Colors are driven by Theme Customizer CSS variables (`--btn-*`, `--primary`).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[5px] text-sm font-semibold leading-none transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--btn-primary)/0.35)] disabled:pointer-events-none disabled:opacity-50 overflow-visible [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border-0 shadow-none hover:brightness-105 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: cn(solidWhite, btnPrimary),
        pos: cn(solidWhite, btnSecondary),
        outline: cn(
          solidWhite,
          btnSecondary,
          "dark:bg-[hsl(var(--card))] dark:hover:bg-[hsl(var(--muted))] dark:text-foreground dark:[&_svg]:text-foreground dark:hover:text-foreground dark:hover:[&_svg]:text-foreground",
        ),
        secondary: cn(
          solidWhite,
          btnSecondary,
          "dark:bg-[hsl(var(--card))] dark:hover:bg-[hsl(var(--muted))] dark:text-foreground dark:[&_svg]:text-foreground dark:hover:text-foreground dark:hover:[&_svg]:text-foreground",
        ),
        ghost: cn(
          solidWhite,
          "bg-[hsl(var(--btn-secondary)/0.85)] hover:bg-[hsl(var(--btn-secondary))]",
          "dark:bg-[hsl(var(--card))] dark:hover:bg-[hsl(var(--muted))] dark:text-foreground dark:[&_svg]:text-foreground dark:hover:text-foreground dark:hover:[&_svg]:text-foreground",
        ),
        link: "font-medium text-primary underline-offset-4 hover:underline border-transparent shadow-none bg-transparent hover:brightness-100 active:scale-100",
        gradient: cn(solidWhite, btnPrimary),
        success: cn(solidWhite, btnSuccess),
        warning: cn(solidWhite, btnWarning),
        danger: cn(solidWhite, btnDanger),
        destructive: cn(solidWhite, btnDestructive),
        info: cn(solidWhite, btnInfo),
        violet: cn(
          solidWhite,
          "bg-violet-600 hover:bg-violet-600 dark:bg-violet-600 dark:hover:bg-violet-600",
        ),
        chip: cn(
          solidWhite,
          "bg-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--btn-secondary))] dark:bg-[hsl(var(--muted-foreground))] dark:hover:bg-[hsl(var(--btn-secondary))]",
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
