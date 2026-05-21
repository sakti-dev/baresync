"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

type DecisionNodeData = {
  label: string;
};

type DecisionNode = Node<DecisionNodeData, "decision">;

function DecisionNodeComponent({ data, selected }: NodeProps<DecisionNode>) {
  return (
    <div
      className={`relative ${selected ? "ring-2 ring-blue-500" : ""}`}
      style={{ width: 160, height: 80 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div
        className="absolute inset-0 flex items-center justify-center bg-card border-2 border-muted"
        style={{
          clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-medium text-center px-4 leading-tight">
          {data.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "30%" }} className="!bg-muted-foreground" />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: "70%" }} className="!bg-muted-foreground" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-muted-foreground" />
    </div>
  );
}

export const DecisionNode = memo(DecisionNodeComponent);
