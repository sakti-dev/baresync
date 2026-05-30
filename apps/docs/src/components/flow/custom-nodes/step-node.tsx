"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";

interface StepNodeData {
  detail?: string;
  label: string;
  step?: number;
  variant?: "default" | "success" | "warning" | "error";
  [key: string]: unknown;
}

type StepNode = Node<StepNodeData, "step">;

const variantStyles: Record<string, string> = {
  default: "bg-card border-border",
  success:
    "bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700",
  warning:
    "bg-yellow-50 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-700",
  error: "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700",
};

function StepNodeComponent({ data, selected }: NodeProps<StepNode>) {
  const v = data.variant ?? "default";

  return (
    <div
      className={`min-w-[220px] rounded-2xl border border-border/70 px-4 py-3 shadow-black/5 shadow-sm dark:shadow-black/20 ${variantStyles[v]} ${selected ? "ring-2 ring-primary/30" : ""}`}
    >
      <Handle
        className="!bg-muted-foreground/70"
        position={Position.Top}
        type="target"
      />
      <div className="flex items-center gap-2">
        {data.step !== undefined && (
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-[10px] text-primary">
            {data.step}
          </span>
        )}
        <span className="font-semibold text-[13px] text-foreground tracking-tight">
          {data.label}
        </span>
      </div>
      {data.detail && (
        <div className="mt-1 ml-8 text-[11px] text-muted-foreground leading-snug">
          {data.detail}
        </div>
      )}
      <Handle
        className="!bg-muted-foreground/70"
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}

export const StepNode = memo(StepNodeComponent);
