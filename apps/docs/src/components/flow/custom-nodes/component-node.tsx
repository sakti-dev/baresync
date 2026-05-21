"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

type ComponentNodeData = {
  label: string;
  sublabel?: string;
};

type ComponentNode = Node<ComponentNodeData, "component">;

function ComponentNodeComponent({ data, selected }: NodeProps<ComponentNode>) {
  return (
    <div
      className={`rounded border px-3 py-2 min-w-[140px] text-center bg-card ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="font-medium text-xs">{data.label}</div>
      {data.sublabel && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{data.sublabel}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeComponent);
