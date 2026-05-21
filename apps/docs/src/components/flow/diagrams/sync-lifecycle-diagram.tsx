"use client";

import type { Edge, Node } from "@xyflow/react";
import { BasicFlow } from "@/components/flow/basic-flow";
import { edgeTypes } from "@/components/flow/edge-types";
import { FlowProvider } from "@/components/flow/flow-provider";
import { nodeTypes } from "@/components/flow/node-types";

const nodes: Node[] = [
  {
    id: "app-start",
    type: "layer",
    position: { x: 180, y: 0 },
    data: { label: "App starts", color: "bg-blue-50 dark:bg-blue-950" },
  },
  {
    id: "migrations",
    type: "step",
    position: { x: 180, y: 100 },
    data: { label: "Migrations run", detail: "automatically" },
  },
  {
    id: "plugin-connect",
    type: "step",
    position: { x: 180, y: 190 },
    data: { label: "Plugin connects to SQLite" },
  },
  {
    id: "user-edits",
    type: "layer",
    position: { x: 180, y: 300 },
    data: {
      label: "User creates/edits data",
      color: "bg-blue-50 dark:bg-blue-950",
    },
  },
  {
    id: "write-db",
    type: "step",
    position: { x: 100, y: 400 },
    data: { label: "Write to local DB" },
  },
  {
    id: "write-local-change",
    type: "step",
    position: { x: 300, y: 400 },
    data: { label: "writeLocalChange()" },
  },
  {
    id: "outbox",
    type: "step",
    position: { x: 300, y: 490 },
    data: {
      label: "sync_outbox entry",
      detail: "dirty count increases",
      variant: "warning",
    },
  },
  {
    id: "polling",
    type: "layer",
    position: { x: 180, y: 600 },
    data: {
      label: "Polling tick / syncNow()",
      color: "bg-purple-50 dark:bg-purple-950",
    },
  },
  {
    id: "read-dirty",
    type: "step",
    position: { x: 0, y: 700 },
    data: { label: "Read dirty outbox" },
  },
  {
    id: "check-server",
    type: "step",
    position: { x: 200, y: 700 },
    data: { label: "Check server changes", detail: "since last cursor" },
  },
  {
    id: "push",
    type: "step",
    position: { x: 100, y: 800 },
    data: { label: "Push to server", detail: "if dirty rows exist" },
  },
  {
    id: "pull",
    type: "step",
    position: { x: 300, y: 800 },
    data: { label: "Pull from server", detail: "if server has changes" },
  },
  {
    id: "gc",
    type: "step",
    position: { x: 200, y: 900 },
    data: { label: "Garbage collection", detail: "remove synced soft-deletes" },
  },
  {
    id: "clean",
    type: "step",
    position: { x: 200, y: 990 },
    data: { label: "Dirty count = 0", variant: "success" },
  },
];

const edges: Edge[] = [
  { id: "e-start-mig", source: "app-start", target: "migrations" },
  { id: "e-mig-connect", source: "migrations", target: "plugin-connect" },
  { id: "e-connect-edits", source: "plugin-connect", target: "user-edits" },
  { id: "e-edits-db", source: "user-edits", target: "write-db" },
  { id: "e-edits-wlc", source: "user-edits", target: "write-local-change" },
  { id: "e-wlc-outbox", source: "write-local-change", target: "outbox" },
  { id: "e-outbox-polling", source: "outbox", target: "polling" },
  { id: "e-polling-dirty", source: "polling", target: "read-dirty" },
  { id: "e-polling-check", source: "polling", target: "check-server" },
  { id: "e-dirty-push", source: "read-dirty", target: "push" },
  { id: "e-check-pull", source: "check-server", target: "pull" },
  { id: "e-push-gc", source: "push", target: "gc" },
  { id: "e-pull-gc", source: "pull", target: "gc" },
  { id: "e-gc-clean", source: "gc", target: "clean" },
];

export function SyncLifecycleDiagram() {
  return (
    <FlowProvider>
      <BasicFlow
        className="h-[700px] w-full"
        edgeTypes={edgeTypes}
        initialEdges={edges}
        initialNodes={nodes}
        nodeTypes={nodeTypes}
      />
    </FlowProvider>
  );
}
