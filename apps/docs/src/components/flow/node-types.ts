import type { NodeTypes } from "@xyflow/react";
import { LayerNode } from "./custom-nodes/layer-node";
import { ComponentNode } from "./custom-nodes/component-node";
import { DecisionNode } from "./custom-nodes/decision-node";
import { StepNode } from "./custom-nodes/step-node";

export const nodeTypes: NodeTypes = {
  layer: LayerNode,
  component: ComponentNode,
  decision: DecisionNode,
  step: StepNode,
};
