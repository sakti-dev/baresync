"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";

interface DecisionNodeData {
  label: string;
  [key: string]: unknown;
}

type DecisionNode = Node<DecisionNodeData, "decision">;

function DecisionNodeComponent({ data, selected }: NodeProps<DecisionNode>) {
  return (
    <div
      className={`relative ${selected ? "ring-2 ring-blue-500" : ""}`}
      style={{ width: 160, height: 80 }}
    >
      <Handle
        className="!bg-muted-foreground"
        position={Position.Top}
        type="target"
      />
      <div
        className="absolute inset-0 flex items-center justify-center border-2 border-muted bg-card"
        style={{
          clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="px-4 text-center font-medium text-xs leading-tight">
          {data.label}
        </span>
      </div>
      <Handle
        className="!bg-muted-foreground"
        id="yes"
        position={Position.Bottom}
        style={{ left: "30%" }}
        type="source"
      />
      <Handle
        className="!bg-muted-foreground"
        id="no"
        position={Position.Bottom}
        style={{ left: "70%" }}
        type="source"
      />
      <Handle
        className="!bg-muted-foreground"
        id="right"
        position={Position.Right}
        type="source"
      />
    </div>
  );
}

export const DecisionNode = memo(DecisionNodeComponent);
