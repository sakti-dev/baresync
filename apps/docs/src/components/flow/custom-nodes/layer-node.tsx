"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";

interface LayerNodeData {
  color?: string;
  label: string;
  sublabel?: string;
  [key: string]: unknown;
}

type LayerNode = Node<LayerNodeData, "layer">;

function LayerNodeComponent({ data, selected }: NodeProps<LayerNode>) {
  const bg = data.color ?? "bg-background";

  return (
    <div
      className={`min-w-[220px] rounded-2xl border border-border/70 px-6 py-4 text-center shadow-black/5 shadow-sm dark:shadow-black/20 ${bg} ${selected ? "ring-2 ring-primary/30" : ""}`}
    >
      <Handle
        className="!bg-muted-foreground/70"
        position={Position.Top}
        type="target"
      />
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-foreground/10" />
      <div className="font-semibold text-[15px] text-foreground tracking-tight">
        {data.label}
      </div>
      {data.sublabel && (
        <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
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

export const LayerNode = memo(LayerNodeComponent);
