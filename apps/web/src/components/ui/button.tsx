import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-[var(--primary-glow)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-none hover:bg-[hsl(var(--primary-hover))] active:scale-[0.98]",
        outline:
          "border border-black/10 bg-white text-foreground shadow-none hover:bg-[#F8FAFC] active:scale-[0.98] dark:border-white/10 dark:bg-card dark:hover:bg-[hsl(var(--card-hover))]",
        secondary:
          "border border-black/10 bg-white text-foreground shadow-none hover:bg-[#F8FAFC] active:scale-[0.98] dark:border-white/10 dark:bg-secondary dark:hover:bg-[hsl(var(--card-hover))]",
        ghost: "hover:bg-[hsl(var(--primary-soft))] hover:text-[hsl(var(--primary-hover))] active:scale-[0.98] dark:hover:bg-white/[0.04]",
        link: "text-primary underline-offset-4 hover:underline",
        gradient:
          "gradient-primary text-white shadow-button hover:opacity-90 active:scale-[0.98] font-semibold",
        success:
          "bg-[#DCFCE7] text-[#16A34A] border border-[#86EFAC] shadow-none hover:bg-emerald-100 active:scale-[0.98] dark:bg-emerald-600 dark:text-white dark:border-transparent dark:hover:bg-emerald-700",
        warning:
          "bg-[#FEF3C7] text-[#F59E0B] border border-[#FCD34D] shadow-none hover:bg-amber-100 active:scale-[0.98] dark:bg-amber-500 dark:text-white dark:border-transparent dark:hover:bg-amber-600",
        destructive:
          "bg-[#FEE2E2] text-[#EF4444] border border-[#FCA5A5] shadow-none hover:bg-red-100 active:scale-[0.98] dark:bg-destructive dark:text-destructive-foreground dark:border-transparent dark:hover:bg-destructive/90",
      },
      size: {
        default: "h-[42px] px-4 py-2",
        sm: "h-9 rounded-control px-3 text-xs",
        lg: "h-11 rounded-control px-8 text-base",
        xl: "h-12 rounded-control px-10 text-base font-semibold",
        icon: "h-[42px] w-[42px]",
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
