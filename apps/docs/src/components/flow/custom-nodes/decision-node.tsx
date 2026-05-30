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
      className={`relative ${selected ? "ring-2 ring-primary/30" : ""}`}
      style={{ width: 180, height: 96 }}
    >
      <Handle
        className="!bg-muted-foreground/70"
        position={Position.Top}
        type="target"
      />
      <div
        className="absolute inset-0 border border-border/70 bg-card shadow-black/5 shadow-sm dark:shadow-black/20"
        style={{
          clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="px-6 text-center font-semibold text-[11px] text-foreground leading-snug tracking-tight">
          {data.label}
        </span>
      </div>
      <Handle
        className="!bg-muted-foreground/70"
        id="yes"
        position={Position.Bottom}
        style={{ left: "30%" }}
        type="source"
      />
      <Handle
        className="!bg-muted-foreground/70"
        id="no"
        position={Position.Bottom}
        style={{ left: "70%" }}
        type="source"
      />
      <Handle
        className="!bg-muted-foreground/70"
        id="right"
        position={Position.Right}
        type="source"
      />
    </div>
  );
}

export const DecisionNode = memo(DecisionNodeComponent);
