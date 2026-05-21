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
      className={`min-w-[200px] rounded-lg border-2 px-4 py-3 ${variantStyles[v]} ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle
        className="!bg-muted-foreground"
        position={Position.Top}
        type="target"
      />
      <div className="flex items-center gap-2">
        {data.step !== undefined && (
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary font-bold text-[10px] text-primary-foreground">
            {data.step}
          </span>
        )}
        <span className="font-medium text-sm">{data.label}</span>
      </div>
      {data.detail && (
        <div className="mt-1 ml-7 text-muted-foreground text-xs">
          {data.detail}
        </div>
      )}
      <Handle
        className="!bg-muted-foreground"
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}

export const StepNode = memo(StepNodeComponent);
