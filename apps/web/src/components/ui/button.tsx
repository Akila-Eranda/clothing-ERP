import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))] shadow-none",
        secondary:
          "border border-border bg-card text-foreground hover:bg-muted",
        outline:
          "border border-border bg-card text-foreground hover:bg-muted hover:text-foreground",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:underline bg-transparent",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        success:
          "bg-[hsl(var(--success))] text-white hover:opacity-90",
        /* backward-compatible aliases */
        pos: "border border-border bg-card text-foreground hover:bg-muted",
        gradient: "bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        warning: "bg-[hsl(var(--warning))] text-white hover:opacity-90",
        info: "bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]",
        violet: "bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]",
        chip: "bg-muted text-muted-foreground hover:bg-muted/80",
      },
      size: {
        default: "h-9 min-h-9 px-4 py-0",
        sm: "h-8 min-h-8 px-3 text-xs py-0",
        lg: "h-10 min-h-10 px-5 text-sm py-0",
        xl: "h-11 min-h-11 px-6 text-base py-0",
        icon: "h-9 w-9 min-h-9",
        "icon-sm": "h-8 w-8 min-h-8",
        "icon-lg": "h-10 w-10 min-h-10",
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
