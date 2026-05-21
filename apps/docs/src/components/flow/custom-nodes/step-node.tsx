"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

type StepNodeData = {
  label: string;
  step?: number;
  detail?: string;
  variant?: "default" | "success" | "warning" | "error";
};

type StepNode = Node<StepNodeData, "step">;

const variantStyles: Record<string, string> = {
  default: "bg-card border-border",
  success: "bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700",
  warning: "bg-yellow-50 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-700",
  error: "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700",
};

function StepNodeComponent({ data, selected }: NodeProps<StepNode>) {
  const v = data.variant ?? "default";

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 min-w-[200px] ${variantStyles[v]} ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        {data.step !== undefined && (
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
            {data.step}
          </span>
        )}
        <span className="text-sm font-medium">{data.label}</span>
      </div>
      {data.detail && (
        <div className="text-xs text-muted-foreground mt-1 ml-7">{data.detail}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

export const StepNode = memo(StepNodeComponent);
