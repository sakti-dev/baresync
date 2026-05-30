import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { EventFlowDiagram } from "@/components/flow/diagrams/event-flow-diagram";
import { SyncEngineDiagram } from "@/components/flow/diagrams/sync-engine-diagram";
import { SyncLifecycleDiagram } from "@/components/flow/diagrams/sync-lifecycle-diagram";
import { SyncModesDiagram } from "@/components/flow/diagrams/sync-modes-diagram";
import { TroubleshootingDiagram } from "@/components/flow/diagrams/troubleshooting-diagram";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...components,
    SyncModesDiagram,
    SyncEngineDiagram,
    TroubleshootingDiagram,
    EventFlowDiagram,
    SyncLifecycleDiagram,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
