"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

type LayerNodeData = {
  label: string;
  sublabel?: string;
  color?: string;
};

type LayerNode = Node<LayerNodeData, "layer">;

function LayerNodeComponent({ data, selected }: NodeProps<LayerNode>) {
  const bg = data.color ?? "bg-background";

  return (
    <div
      className={`rounded-lg border-2 px-6 py-3 min-w-[180px] text-center ${bg} ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="font-semibold text-sm">{data.label}</div>
      {data.sublabel && (
        <div className="text-xs text-muted-foreground mt-1">{data.sublabel}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

export const LayerNode = memo(LayerNodeComponent);
