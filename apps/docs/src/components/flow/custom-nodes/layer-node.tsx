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
      className={`min-w-[180px] rounded-lg border-2 px-6 py-3 text-center ${bg} ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle
        className="!bg-muted-foreground"
        position={Position.Top}
        type="target"
      />
      <div className="font-semibold text-sm">{data.label}</div>
      {data.sublabel && (
        <div className="mt-1 text-muted-foreground text-xs">
          {data.sublabel}
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

export const LayerNode = memo(LayerNodeComponent);
