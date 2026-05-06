import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border-border bg-background text-foreground/80 hover:bg-muted",
        warning:
          "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
        info: "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100",
        soft: "border-slate-200 bg-slate-100/70 text-slate-700 hover:bg-slate-200/70",
        softDestructive:
          "border-red-200 bg-red-50 text-red-900 hover:bg-red-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
