"use client";

import type { Edge, Node } from "@xyflow/react";
import { BasicFlow } from "@/components/flow/basic-flow";
import { edgeTypes } from "@/components/flow/edge-types";
import { FlowProvider } from "@/components/flow/flow-provider";
import { nodeTypes } from "@/components/flow/node-types";

const nodes: Node[] = [
  {
    id: "js-client",
    type: "layer",
    position: { x: 0, y: 80 },
    data: {
      label: "JS Client",
      sublabel: "SyncClient",
      color: "bg-blue-50 dark:bg-blue-950",
    },
  },
  {
    id: "tauri-plugin",
    type: "layer",
    position: { x: 260, y: 80 },
    data: {
      label: "Tauri Plugin",
      sublabel: "Rust",
      color: "bg-purple-50 dark:bg-purple-950",
    },
  },
  {
    id: "server",
    type: "layer",
    position: { x: 520, y: 80 },
    data: {
      label: "Server",
      sublabel: "Routes",
      color: "bg-green-50 dark:bg-green-950",
    },
  },
  {
    id: "engine",
    type: "component",
    position: { x: 260, y: 200 },
    data: { label: "Sync Engine", sublabel: "status · push · pull · gc" },
  },
  {
    id: "sqlite",
    type: "component",
    position: { x: 260, y: 320 },
    data: { label: "SQLite", sublabel: "tables · outbox · cursors" },
  },
];

const edges: Edge[] = [
  {
    id: "e-client-plugin",
    source: "js-client",
    target: "tauri-plugin",
    type: "labeled",
    data: { label: "commands" },
  },
  {
    id: "e-plugin-client",
    source: "tauri-plugin",
    target: "js-client",
    type: "labeled",
    data: { label: "events" },
  },
  {
    id: "e-plugin-server",
    source: "tauri-plugin",
    target: "server",
    type: "labeled",
    data: { label: "HTTP" },
  },
  {
    id: "e-server-plugin",
    source: "server",
    target: "tauri-plugin",
    type: "labeled",
    data: { label: "response" },
  },
  { id: "e-plugin-engine", source: "tauri-plugin", target: "engine" },
  { id: "e-engine-sqlite", source: "engine", target: "sqlite" },
];

export function SyncEngineDiagram() {
  return (
    <FlowProvider>
      <BasicFlow
        className="h-[450px] w-full"
        edgeTypes={edgeTypes}
        initialEdges={edges}
        initialNodes={nodes}
        nodeTypes={nodeTypes}
      />
    </FlowProvider>
  );
}
