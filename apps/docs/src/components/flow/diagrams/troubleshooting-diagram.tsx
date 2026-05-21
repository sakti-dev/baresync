"use client";

import type { Edge, Node } from "@xyflow/react";
import { BasicFlow } from "@/components/flow/basic-flow";
import { edgeTypes } from "@/components/flow/edge-types";
import { FlowProvider } from "@/components/flow/flow-provider";
import { nodeTypes } from "@/components/flow/node-types";

const nodes: Node[] = [
  {
    id: "step1",
    type: "step",
    position: { x: 200, y: 0 },
    data: { step: 1, label: "Check local state", detail: "client.getState()" },
  },
  {
    id: "dirty-check",
    type: "decision",
    position: { x: 200, y: 120 },
    data: { label: "dirty_count > 0?" },
  },
  {
    id: "dirty-yes",
    type: "step",
    position: { x: 0, y: 250 },
    data: {
      label: "Changes not pushed yet",
      detail: "Continue to Step 2",
      variant: "warning",
    },
  },
  {
    id: "dirty-no",
    type: "step",
    position: { x: 420, y: 250 },
    data: {
      label: "Changes were pushed",
      detail: "Continue to Step 3",
      variant: "success",
    },
  },
  {
    id: "step2",
    type: "step",
    position: { x: 0, y: 370 },
    data: {
      step: 2,
      label: "Check push result",
      detail: "client.syncNow()",
    },
  },
  {
    id: "push-synced",
    type: "step",
    position: { x: -200, y: 490 },
    data: {
      label: "Push succeeded",
      detail: "Server has data",
      variant: "success",
    },
  },
  {
    id: "push-rejected",
    type: "step",
    position: { x: 0, y: 490 },
    data: {
      label: "Tables rejected",
      detail: "Check server logs",
      variant: "error",
    },
  },
  {
    id: "push-missing",
    type: "step",
    position: { x: 200, y: 490 },
    data: { label: "Push didn't run", variant: "warning" },
  },
  {
    id: "push-error",
    type: "step",
    position: { x: 400, y: 490 },
    data: {
      label: "Push threw error",
      detail: "Check error type",
      variant: "error",
    },
  },
  {
    id: "step3",
    type: "step",
    position: { x: 420, y: 370 },
    data: {
      step: 3,
      label: "Check pull on device",
      detail: "last_server_watermark",
    },
  },
  {
    id: "step4",
    type: "step",
    position: { x: 420, y: 490 },
    data: {
      step: 4,
      label: "Check server",
      detail: "Query server DB directly",
    },
  },
  {
    id: "step5",
    type: "step",
    position: { x: 420, y: 610 },
    data: {
      step: 5,
      label: "Nuclear option",
      detail: "client.fullResync()",
      variant: "error",
    },
  },
];

const edges: Edge[] = [
  { id: "e1-dirty", source: "step1", target: "dirty-check" },
  {
    id: "e-dirty-yes",
    source: "dirty-check",
    sourceHandle: "yes",
    target: "dirty-yes",
    type: "labeled",
    data: { label: "yes" },
  },
  {
    id: "e-dirty-no",
    source: "dirty-check",
    sourceHandle: "no",
    target: "dirty-no",
    type: "labeled",
    data: { label: "no" },
  },
  { id: "e-to-step2", source: "dirty-yes", target: "step2" },
  { id: "e-to-step3", source: "dirty-no", target: "step3" },
  { id: "e2-synced", source: "step2", target: "push-synced" },
  { id: "e2-rejected", source: "step2", target: "push-rejected" },
  { id: "e2-missing", source: "step2", target: "push-missing" },
  { id: "e2-error", source: "step2", target: "push-error" },
  { id: "e3-to-step4", source: "step3", target: "step4" },
  { id: "e4-to-step5", source: "step4", target: "step5" },
];

export function TroubleshootingDiagram() {
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
