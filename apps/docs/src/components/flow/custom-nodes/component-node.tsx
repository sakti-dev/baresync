"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";

interface ComponentNodeData {
  label: string;
  sublabel?: string;
  [key: string]: unknown;
}

type ComponentNode = Node<ComponentNodeData, "component">;

function ComponentNodeComponent({ data, selected }: NodeProps<ComponentNode>) {
  return (
    <div
      className={`min-w-[150px] rounded-xl border border-border/70 bg-card/95 px-3.5 py-2.5 text-center shadow-black/5 shadow-sm dark:shadow-black/20 ${selected ? "ring-2 ring-primary/30" : ""}`}
    >
      <Handle
        className="!bg-muted-foreground/70"
        position={Position.Top}
        type="target"
      />
      <div className="font-medium text-[12px] text-foreground tracking-tight">
        {data.label}
      </div>
      {data.sublabel && (
        <div className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
          {data.sublabel}
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

export const ComponentNode = memo(ComponentNodeComponent);
