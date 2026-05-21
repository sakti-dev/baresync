"use client";

import type { Edge, Node } from "@xyflow/react";
import { BasicFlow } from "@/components/flow/basic-flow";
import { edgeTypes } from "@/components/flow/edge-types";
import { FlowProvider } from "@/components/flow/flow-provider";
import { nodeTypes } from "@/components/flow/node-types";

const nodes: Node[] = [
  {
    id: "react-app",
    type: "layer",
    position: { x: 200, y: 0 },
    data: { label: "React App", color: "bg-blue-50 dark:bg-blue-950" },
  },
  {
    id: "react-query",
    type: "component",
    position: { x: 0, y: 80 },
    data: { label: "React Query", sublabel: "cache layer" },
  },
  {
    id: "sync-client",
    type: "component",
    position: { x: 200, y: 80 },
    data: { label: "SyncClient", sublabel: "provider" },
  },
  {
    id: "drizzle-proxy",
    type: "component",
    position: { x: 400, y: 80 },
    data: { label: "Drizzle", sublabel: "proxy DB" },
  },

  {
    id: "tauri-plugin",
    type: "layer",
    position: { x: 200, y: 220 },
    data: {
      label: "Tauri Plugin",
      sublabel: "Rust",
      color: "bg-purple-50 dark:bg-purple-950",
    },
  },
  {
    id: "sqlite-pool",
    type: "component",
    position: { x: 0, y: 300 },
    data: { label: "SQLite Pool" },
  },
  {
    id: "sync-engine",
    type: "component",
    position: { x: 200, y: 300 },
    data: { label: "Sync Engine", sublabel: "status · push · pull · gc" },
  },
  {
    id: "migration-runner",
    type: "component",
    position: { x: 400, y: 300 },
    data: { label: "Migration Runner" },
  },

  {
    id: "server",
    type: "layer",
    position: { x: 200, y: 440 },
    data: {
      label: "Server",
      sublabel: "Hono",
      color: "bg-green-50 dark:bg-green-950",
    },
  },
  {
    id: "status-route",
    type: "component",
    position: { x: 0, y: 520 },
    data: { label: "/status" },
  },
  {
    id: "pull-route",
    type: "component",
    position: { x: 150, y: 520 },
    data: { label: "/pull" },
  },
  {
    id: "push-route",
    type: "component",
    position: { x: 300, y: 520 },
    data: { label: "/push" },
  },
  {
    id: "server-db",
    type: "component",
    position: { x: 150, y: 600 },
    data: { label: "Server DB", sublabel: "SQLite / Postgres" },
  },
];

const edges: Edge[] = [
  {
    id: "e-react-query-plugin",
    source: "react-query",
    target: "tauri-plugin",
    type: "labeled",
    data: { label: "invoke" },
  },
  {
    id: "e-sync-client-plugin",
    source: "sync-client",
    target: "sync-engine",
    type: "labeled",
    data: { label: "commands" },
  },
  {
    id: "e-drizzle-plugin",
    source: "drizzle-proxy",
    target: "sqlite-pool",
    type: "labeled",
    data: { label: "SQL via IPC" },
  },
  {
    id: "e-engine-status",
    source: "sync-engine",
    target: "status-route",
    type: "labeled",
    data: { label: "HTTP" },
  },
  {
    id: "e-engine-pull",
    source: "sync-engine",
    target: "pull-route",
    type: "labeled",
    data: { label: "HTTP" },
  },
  {
    id: "e-engine-push",
    source: "sync-engine",
    target: "push-route",
    type: "labeled",
    data: { label: "HTTP" },
  },
  {
    id: "e-pool-engine",
    source: "sqlite-pool",
    target: "sync-engine",
    type: "labeled",
    data: { label: "read/write" },
  },
  { id: "e-migration-pool", source: "migration-runner", target: "sqlite-pool" },
  { id: "e-status-db", source: "status-route", target: "server-db" },
  { id: "e-pull-db", source: "pull-route", target: "server-db" },
  { id: "e-push-db", source: "push-route", target: "server-db" },
];

export function ArchitectureDiagram() {
  return (
    <FlowProvider>
      <BasicFlow
        edgeTypes={edgeTypes}
        initialEdges={edges}
        initialNodes={nodes}
        nodeTypes={nodeTypes}
      />
    </FlowProvider>
  );
}
