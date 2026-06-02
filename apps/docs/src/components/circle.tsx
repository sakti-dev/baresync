import { forwardRef } from "react";

import { cn } from "@/lib/utils";

interface CircleProps {
  children?: React.ReactNode;
  className?: string;
}

export const Circle = forwardRef<HTMLDivElement, CircleProps>(
  ({ className, children }, ref) => (
    <div
      className={cn(
        "z-10 flex size-12 items-center justify-center rounded-full border border-fd-border bg-fd-card p-3",
        className
      )}
      ref={ref}
    >
      {children}
    </div>
  )
);

Circle.displayName = "Circle";
