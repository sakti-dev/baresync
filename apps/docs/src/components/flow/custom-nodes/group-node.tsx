"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";

interface GroupNodeData {
  label: string;
  sublabel?: string;
  tone?: "blue" | "purple" | "green";
  [key: string]: unknown;
}

type GroupNode = Node<GroupNodeData, "group">;

const toneStyles: Record<NonNullable<GroupNodeData["tone"]>, string> = {
  blue: "outline-teal-300/70 bg-teal-50/90 dark:outline-teal-400/30 dark:bg-teal-200/10",
  purple:
    "outline-indigo-300/70 bg-indigo-50/90 dark:outline-indigo-400/30 dark:bg-indigo-200/10",
  green:
    "outline-amber-300/70 bg-amber-50/90 dark:outline-amber-400/30 dark:bg-amber-200/10",
};

function GroupNodeComponent({ data }: NodeProps<GroupNode>) {
  const tone = data.tone ?? "blue";

  return (
    <div
      className={`pointer-events-none flex h-full w-full rounded-[28px] shadow-black/5 shadow-sm outline-dashed outline-2 outline-offset-1 backdrop-blur-[1px] dark:shadow-black/20 ${toneStyles[tone]}`}
    >
      <Handle className="opacity-0" position={Position.Top} type="target" />
      <div className="flex h-full w-full flex-col px-5 py-4">
        <div className="border-border/35 border-b pb-3">
          <div className="font-semibold text-[15px] text-foreground tracking-tight">
            {data.label}
          </div>
          {data.sublabel && (
            <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
              {data.sublabel}
            </div>
          )}
        </div>
        <div className="flex-1" />
      </div>
      <Handle className="opacity-0" position={Position.Bottom} type="source" />
    </div>
  );
}

export const GroupNode = memo(GroupNodeComponent);
