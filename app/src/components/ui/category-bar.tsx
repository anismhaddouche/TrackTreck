import * as React from "react";
import { cn } from "@/lib/utils";

export interface CategoryBarItem {
  value: number;
  colorClassName: string;
  tooltip?: string;
}

export interface CategoryBarProps extends React.HTMLAttributes<HTMLDivElement> {
  values?: number[];
  colors?: string[];
  items?: CategoryBarItem[];
}

export const CategoryBar = React.forwardRef<HTMLDivElement, CategoryBarProps>(
  ({ values = [], colors = [], items, className, ...props }, ref) => {
    const normalizedItems: CategoryBarItem[] =
      items ??
      values.map((val, idx) => ({
        value: val,
        colorClassName: colors[idx] || "bg-primary",
      }));

    const total = normalizedItems.reduce(
      (acc, curr) => acc + Math.max(0, curr.value),
      0,
    );

    return (
      <div
        ref={ref}
        className={cn(
          "flex h-2.5 w-full overflow-hidden rounded-full bg-muted/60 gap-1",
          className,
        )}
        {...props}
      >
        {total === 0 ? (
          <div className="h-full w-full bg-muted/40 rounded-full" />
        ) : (
          normalizedItems.map((item, idx) => {
            if (item.value <= 0) return null;
            const percentage = (item.value / total) * 100;
            return (
              <div
                key={idx}
                style={{ width: `${percentage}%` }}
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  item.colorClassName,
                )}
                title={item.tooltip}
              />
            );
          })
        )}
      </div>
    );
  },
);

CategoryBar.displayName = "CategoryBar";
