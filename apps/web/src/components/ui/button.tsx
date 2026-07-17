import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-button hover:bg-primary/90 active:scale-[0.98]",
        destructive:
          "bg-red-50 text-red-600 border border-red-100 shadow-none hover:bg-red-100 active:scale-[0.98] dark:bg-destructive dark:text-destructive-foreground dark:border-transparent dark:hover:bg-destructive/90",
        outline:
          "border border-border bg-white text-foreground shadow-none hover:bg-[#F3F6FC] hover:border-border active:scale-[0.98] dark:bg-background dark:hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground border border-border shadow-none hover:bg-[#F3F6FC] active:scale-[0.98]",
        ghost: "hover:bg-[#F3F6FC] hover:text-foreground active:scale-[0.98] dark:hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
        gradient:
          "gradient-primary text-white shadow-button hover:opacity-90 active:scale-[0.98] font-semibold",
        success:
          "bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-none hover:bg-emerald-100 active:scale-[0.98] dark:bg-emerald-600 dark:text-white dark:border-transparent dark:hover:bg-emerald-700",
        warning:
          "bg-amber-50 text-amber-700 border border-amber-100 shadow-none hover:bg-amber-100 active:scale-[0.98] dark:bg-amber-500 dark:text-white dark:border-transparent dark:hover:bg-amber-600",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-[10px] px-3 text-xs",
        lg: "h-11 rounded-[10px] px-8 text-base",
        xl: "h-12 rounded-[10px] px-10 text-base font-semibold",
        icon: "h-10 w-10",
        "icon-sm": "h-9 w-9",
        "icon-lg": "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
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
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
