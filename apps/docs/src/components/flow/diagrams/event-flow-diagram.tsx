"use client";

import type { Edge, Node } from "@xyflow/react";
import { BasicFlow } from "@/components/flow/basic-flow";
import { edgeTypes } from "@/components/flow/edge-types";
import { FlowProvider } from "@/components/flow/flow-provider";
import { nodeTypes } from "@/components/flow/node-types";

const nodes: Node[] = [
  {
    id: "user-writes",
    type: "layer",
    position: { x: 180, y: 0 },
    data: { label: "User writes data", color: "bg-blue-50 dark:bg-blue-950" },
  },
  {
    id: "write-tx",
    type: "step",
    position: { x: 180, y: 100 },
    data: { label: "writeTransaction", detail: "writeLocalChange()" },
  },
  {
    id: "run-sql",
    type: "step",
    position: { x: 180, y: 200 },
    data: { label: "run_sql", detail: "insert row + insert outbox entry" },
  },
  {
    id: "emit-data",
    type: "step",
    position: { x: 0, y: 300 },
    data: {
      label: "emit data-changed",
      detail: "UI re-fetches",
      variant: "success",
    },
  },
  {
    id: "notify-polling",
    type: "step",
    position: { x: 180, y: 300 },
    data: { label: "Notify polling loop" },
  },
  {
    id: "sync-now",
    type: "step",
    position: { x: 180, y: 400 },
    data: { label: "syncNow()", detail: "push → pull" },
  },
  {
    id: "emit-status",
    type: "step",
    position: { x: 0, y: 500 },
    data: { label: "emit sync-status-changed", variant: "success" },
  },
  {
    id: "emit-data2",
    type: "step",
    position: { x: 360, y: 500 },
    data: {
      label: "emit data-changed",
      detail: "UI re-fetches with server data",
      variant: "success",
    },
  },
  {
    id: "emit-status2",
    type: "step",
    position: { x: 180, y: 600 },
    data: { label: "emit sync-status-changed", variant: "success" },
  },
];

const edges: Edge[] = [
  { id: "e-user-tx", source: "user-writes", target: "write-tx" },
  { id: "e-tx-sql", source: "write-tx", target: "run-sql" },
  { id: "e-sql-emit", source: "run-sql", target: "emit-data" },
  { id: "e-sql-notify", source: "run-sql", target: "notify-polling" },
  { id: "e-notify-sync", source: "notify-polling", target: "sync-now" },
  { id: "e-sync-status", source: "sync-now", target: "emit-status" },
  { id: "e-sync-data", source: "sync-now", target: "emit-data2" },
  { id: "e-sync-status2", source: "sync-now", target: "emit-status2" },
];

export function EventFlowDiagram() {
  return (
    <FlowProvider>
      <BasicFlow
        className="h-[650px] w-full"
        edgeTypes={edgeTypes}
        initialEdges={edges}
        initialNodes={nodes}
        nodeTypes={nodeTypes}
      />
    </FlowProvider>
  );
}
