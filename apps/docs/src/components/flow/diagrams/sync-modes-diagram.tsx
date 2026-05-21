"use client";

import type { Edge, Node } from "@xyflow/react";
import { BasicFlow } from "@/components/flow/basic-flow";
import { edgeTypes } from "@/components/flow/edge-types";
import { FlowProvider } from "@/components/flow/flow-provider";
import { nodeTypes } from "@/components/flow/node-types";

const nodes: Node[] = [
  {
    id: "sync-now",
    type: "layer",
    position: { x: 280, y: 0 },
    data: { label: "sync_now()", color: "bg-blue-50 dark:bg-blue-950" },
  },
  {
    id: "check-baseline",
    type: "decision",
    position: { x: 250, y: 120 },
    data: { label: "needs_baseline_sync?" },
  },
  {
    id: "full-resync",
    type: "step",
    position: { x: 0, y: 260 },
    data: {
      label: "FullResync",
      detail: "Pull from empty cursor, then push",
      variant: "warning",
    },
  },
  {
    id: "check-dirty",
    type: "decision",
    position: { x: 250, y: 300 },
    data: { label: "local dirty > 0?" },
  },
  {
    id: "check-server",
    type: "decision",
    position: { x: 250, y: 460 },
    data: { label: "server has changes?" },
  },
  {
    id: "noop",
    type: "step",
    position: { x: 0, y: 430 },
    data: {
      label: "NoOp",
      detail: "Both sides up to date",
      variant: "success",
    },
  },
  {
    id: "push-only",
    type: "step",
    position: { x: 500, y: 430 },
    data: { label: "PushOnly", detail: "Push outbox, reconcile rejects" },
  },
  {
    id: "pull-only",
    type: "step",
    position: { x: 0, y: 600 },
    data: { label: "PullOnly", detail: "Pull from cursor, update local" },
  },
  {
    id: "full-sync",
    type: "step",
    position: { x: 500, y: 600 },
    data: {
      label: "FullSync",
      detail: "Pull first, then push, reconcile",
      variant: "warning",
    },
  },
];

const edges: Edge[] = [
  { id: "e-now-baseline", source: "sync-now", target: "check-baseline" },
  {
    id: "e-baseline-yes",
    source: "check-baseline",
    sourceHandle: "right",
    target: "full-resync",
    type: "labeled",
    data: { label: "yes" },
  },
  {
    id: "e-baseline-no",
    source: "check-baseline",
    sourceHandle: "no",
    target: "check-dirty",
    type: "labeled",
    data: { label: "no" },
  },
  {
    id: "e-dirty-no-noop",
    source: "check-dirty",
    sourceHandle: "yes",
    target: "noop",
    type: "labeled",
    data: { label: "dirty = 0" },
  },
  {
    id: "e-dirty-yes-check",
    source: "check-dirty",
    sourceHandle: "no",
    target: "check-server",
    type: "labeled",
    data: { label: "dirty > 0" },
  },
  {
    id: "e-dirty-no-check",
    source: "check-dirty",
    sourceHandle: "yes",
    target: "check-server",
    type: "labeled",
    data: { label: "dirty = 0" },
  },
  {
    id: "e-dirty-yes-push",
    source: "check-dirty",
    sourceHandle: "no",
    target: "push-only",
    type: "labeled",
    data: { label: "dirty > 0" },
  },
  {
    id: "e-server-yes-pull",
    source: "check-server",
    sourceHandle: "yes",
    target: "pull-only",
    type: "labeled",
    data: { label: "has changes" },
  },
  {
    id: "e-server-yes-full",
    source: "check-server",
    sourceHandle: "no",
    target: "full-sync",
    type: "labeled",
    data: { label: "has changes" },
  },
  {
    id: "e-server-no-noop",
    source: "check-server",
    sourceHandle: "yes",
    target: "noop",
    type: "labeled",
    data: { label: "no changes" },
  },
  {
    id: "e-server-no-push",
    source: "check-server",
    sourceHandle: "no",
    target: "push-only",
    type: "labeled",
    data: { label: "no changes" },
  },
];

export function SyncModesDiagram() {
  return (
    <FlowProvider>
      <BasicFlow
        className="h-[500px] w-full"
        edgeTypes={edgeTypes}
        initialEdges={edges}
        initialNodes={nodes}
        nodeTypes={nodeTypes}
      />
    </FlowProvider>
  );
}
