import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * System button styles — matched to header POS / toolbar design:
 * flat primary, soft outline with primary hover tint, 18px icons, 0.5rem radius.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-[0.4375rem] whitespace-nowrap",
    "rounded-lg text-[0.8125rem] font-semibold leading-none tracking-[0.01em]",
    "transition-[background-color,border-color,color,opacity,filter] duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border-0 bg-primary text-white shadow-none hover:bg-[hsl(var(--primary-hover))] active:brightness-[0.96]",
        secondary:
          "border border-border bg-card text-foreground shadow-none hover:border-primary/35 hover:bg-primary/[0.06] hover:text-primary",
        outline:
          "border border-border bg-card text-foreground shadow-none hover:border-primary/35 hover:bg-primary/[0.06] hover:text-primary",
        ghost:
          "border-0 bg-transparent text-muted-foreground shadow-none hover:bg-primary/10 hover:text-primary",
        link:
          "border-0 bg-transparent text-primary underline-offset-4 shadow-none hover:underline",
        destructive:
          "border-0 bg-destructive text-white shadow-none hover:bg-destructive/90 active:brightness-[0.96]",
        success:
          "border-0 bg-[hsl(var(--success))] text-white shadow-none hover:opacity-90 active:brightness-[0.96]",
        /* aliases */
        pos: "border border-border bg-card text-foreground shadow-none hover:border-primary/35 hover:bg-primary/[0.06] hover:text-primary",
        gradient:
          "border-0 bg-primary text-white shadow-none hover:bg-[hsl(var(--primary-hover))] active:brightness-[0.96]",
        danger:
          "border-0 bg-destructive text-white shadow-none hover:bg-destructive/90 active:brightness-[0.96]",
        warning:
          "border-0 bg-[hsl(var(--warning))] text-white shadow-none hover:opacity-90 active:brightness-[0.96]",
        info:
          "border-0 bg-primary text-white shadow-none hover:bg-[hsl(var(--primary-hover))] active:brightness-[0.96]",
        violet:
          "border-0 bg-primary text-white shadow-none hover:bg-[hsl(var(--primary-hover))] active:brightness-[0.96]",
        chip:
          "border-0 bg-muted text-muted-foreground shadow-none hover:bg-muted/80",
      },
      size: {
        default: "h-9 min-h-9 px-3.5 py-0",
        sm: "h-8 min-h-8 px-3 text-xs py-0 [&_svg]:size-4",
        lg: "h-10 min-h-10 px-4 text-sm py-0",
        xl: "h-11 min-h-11 px-5 text-sm py-0",
        icon: "h-9 w-9 min-h-9 px-0",
        "icon-sm": "h-8 w-8 min-h-8 px-0 [&_svg]:size-4",
        "icon-lg": "h-10 w-10 min-h-10 px-0",
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
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
