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
      className={`min-w-[140px] rounded border bg-card px-3 py-2 text-center ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle
        className="!bg-muted-foreground"
        position={Position.Top}
        type="target"
      />
      <div className="font-medium text-xs">{data.label}</div>
      {data.sublabel && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">
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

export const ComponentNode = memo(ComponentNodeComponent);
