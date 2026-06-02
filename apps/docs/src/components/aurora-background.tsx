"use client";
import type React from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

export function AuroraBackground({
  className,
  children,
  showRadialGradient = false,
  ...props
}: AuroraBackgroundProps) {
  return (
    <div className={cn("relative overflow-hidden", className)} {...props}>
      <div
        className="pointer-events-none absolute inset-0"
        style={
          {
            "--lime-300": "oklch(0.75 0.15 130)",
            "--lime-400": "oklch(0.7 0.12 140)",
            "--lime-500": "oklch(0.83 0.18 120)",
            "--lime-600": "oklch(0.65 0.1 150)",
            "--lime-700": "oklch(0.6 0.08 160)",
            "--brand-bg": "oklch(0.13 0.008 250)",
            "--transparent": "transparent",
          } as React.CSSProperties
        }
      >
        <div
          className={cn(
            "absolute inset-0 opacity-20 blur-[10px] filter will-change-transform",
            "[--aurora:repeating-linear-gradient(100deg,var(--lime-500)_10%,var(--lime-300)_15%,var(--lime-400)_20%,var(--lime-600)_25%,var(--lime-700)_30%)]",
            "[--dark-gradient:repeating-linear-gradient(100deg,var(--brand-bg)_0%,var(--brand-bg)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--brand-bg)_16%)]",
            "[background-image:var(--dark-gradient),var(--aurora)]",
            "[background-size:300%,_200%]",
            "[background-position:50%_50%,50%_50%]",
            "after:absolute after:inset-0 after:animate-aurora after:mix-blend-difference after:content-['']",
            "after:[background-attachment:fixed] after:[background-image:var(--dark-gradient),var(--aurora)] after:[background-size:200%,_100%]",
            showRadialGradient &&
              "[mask-image:radial-gradient(ellipse_at_50%_50%,black_20%,var(--transparent)_70%)]"
          )}
        />
      </div>
      {children}
    </div>
  );
}
