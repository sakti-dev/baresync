import type { NodeTypes } from "@xyflow/react";
import { ComponentNode } from "./custom-nodes/component-node";
import { DecisionNode } from "./custom-nodes/decision-node";
import { LayerNode } from "./custom-nodes/layer-node";
import { StepNode } from "./custom-nodes/step-node";

export const nodeTypes: NodeTypes = {
  layer: LayerNode,
  component: ComponentNode,
  decision: DecisionNode,
  step: StepNode,
};
