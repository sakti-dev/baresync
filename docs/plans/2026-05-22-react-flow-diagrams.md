# React Flow Diagrams for Baresync Docs

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 6 ASCII art diagrams in the docs with interactive React Flow diagrams using `@xyflow/react`.

**Architecture:** Each MDX page gets a dedicated flow component. Shared infrastructure (provider wrapper, base flow component, custom node/edge types) lives in `src/components/flow/`. MDX components are registered in `src/components/mdx.tsx` so they can be used as JSX tags in MDX files. Each diagram is self-contained — its nodes/edges are defined inline in the component file.

**Tech Stack:** `@xyflow/react` v12, React 19, fumadocs (TanStack Router + MDX), Tailwind CSS 4, `next-themes` (via fumadocs `useTheme`)

**No TDD** — visual/interactive components, verified by running `bun dev` in `apps/docs`.

---

## Shared Infrastructure

These tasks create reusable building blocks that all 6 diagrams depend on.

### Task 1: Install @xyflow/react

**Files:**
- Modify: `apps/docs/package.json` (via bun add)
- Modify: `apps/docs/src/styles/app.css`

**Step 1: Install the package**

```bash
cd apps/docs && bun add @xyflow/react
```

**Step 2: Add React Flow base CSS import to app.css**

Add after the existing imports in `apps/docs/src/styles/app.css`:

```css
@import "tailwindcss";
@import "fumadocs-ui/css/neutral.css";
@import "fumadocs-ui/css/preset.css";
@import "@xyflow/react/dist/style.css";
```

**Step 3: Verify**

```bash
cd apps/docs && bun run types:check
```

Expected: no errors related to `@xyflow/react`.

**Step 4: Commit**

```bash
git add apps/docs/package.json apps/docs/src/styles/app.css
git commit -m "chore(docs): add @xyflow/react dependency"
```

---

### Task 2: Create shared flow infrastructure

**Files:**
- Create: `apps/docs/src/components/flow/flow-provider.tsx`
- Create: `apps/docs/src/components/flow/basic-flow.tsx`
- Create: `apps/docs/src/components/flow/custom-nodes/layer-node.tsx`
- Create: `apps/docs/src/components/flow/custom-nodes/component-node.tsx`
- Create: `apps/docs/src/components/flow/custom-nodes/decision-node.tsx`
- Create: `apps/docs/src/components/flow/custom-nodes/step-node.tsx`
- Create: `apps/docs/src/components/flow/custom-edges/labeled-edge.tsx`
- Create: `apps/docs/src/components/flow/node-types.ts`
- Create: `apps/docs/src/components/flow/edge-types.ts`

**Step 1: Create flow-provider.tsx**

```tsx
// src/components/flow/flow-provider.tsx
"use client";

import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";

type FlowProviderProps = {
  children: ReactNode;
};

export function FlowProvider({ children }: FlowProviderProps) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}
```

**Step 2: Create basic-flow.tsx**

This is the reusable canvas that all 6 diagrams use. It handles dark mode, resize re-centering, and the standard controls.

```tsx
// src/components/flow/basic-flow.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import { useTheme } from "fumadocs-ui/provider/base";
import type { ReactNode } from "react";

type BasicFlowProps = {
  initialNodes: Node[];
  initialEdges: Edge[];
  nodeTypes?: NodeTypes;
  edgeTypes?: EdgeTypes;
  children?: ReactNode;
  className?: string;
};

export function BasicFlow({
  initialNodes,
  initialEdges,
  nodeTypes,
  edgeTypes,
  children,
  className,
}: BasicFlowProps) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { fitView } = useReactFlow();
  useEffect(() => {
    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        fitView({ padding: 0.4 });
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(rafId);
    };
  }, [fitView]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [],
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      animated: true,
      type: "smoothstep",
    }),
    [],
  );

  return (
    <div className={className ?? "h-[600px] w-full"}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
        colorMode={
          mounted && resolvedTheme === "dark"
            ? "dark"
            : mounted && resolvedTheme === "light"
              ? "light"
              : "dark"
        }
      >
        <Controls />
        <MiniMap className="hidden md:block" />
        <Background gap={16} size={1} />
        {children}
      </ReactFlow>
    </div>
  );
}
```

**Step 3: Create layer-node.tsx** (for architecture diagrams — rounded boxes with title and subtitle)

```tsx
// src/components/flow/custom-nodes/layer-node.tsx
"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

type LayerNodeData = {
  label: string;
  sublabel?: string;
  color?: string;
};

type LayerNode = Node<LayerNodeData, "layer">;

function LayerNodeComponent({ data, selected }: NodeProps<LayerNode>) {
  const bg = data.color ?? "bg-background";

  return (
    <div
      className={`rounded-lg border-2 px-6 py-3 min-w-[180px] text-center ${bg} ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="font-semibold text-sm">{data.label}</div>
      {data.sublabel && (
        <div className="text-xs text-muted-foreground mt-1">{data.sublabel}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

export const LayerNode = memo(LayerNodeComponent);
```

**Step 4: Create component-node.tsx** (for sub-components inside architecture layers — smaller boxes)

```tsx
// src/components/flow/custom-nodes/component-node.tsx
"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

type ComponentNodeData = {
  label: string;
  sublabel?: string;
};

type ComponentNode = Node<ComponentNodeData, "component">;

function ComponentNodeComponent({ data, selected }: NodeProps<ComponentNode>) {
  return (
    <div
      className={`rounded border px-3 py-2 min-w-[140px] text-center bg-card ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="font-medium text-xs">{data.label}</div>
      {data.sublabel && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{data.sublabel}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeComponent);
```

**Step 5: Create decision-node.tsx** (diamond-shaped for branching logic)

```tsx
// src/components/flow/custom-nodes/decision-node.tsx
"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

type DecisionNodeData = {
  label: string;
};

type DecisionNode = Node<DecisionNodeData, "decision">;

function DecisionNodeComponent({ data, selected }: NodeProps<DecisionNode>) {
  return (
    <div
      className={`relative ${selected ? "ring-2 ring-blue-500" : ""}`}
      style={{ width: 160, height: 80 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div
        className="absolute inset-0 flex items-center justify-center bg-card border-2 border-muted"
        style={{
          clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-medium text-center px-4 leading-tight">
          {data.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "30%" }} className="!bg-muted-foreground" />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: "70%" }} className="!bg-muted-foreground" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-muted-foreground" />
    </div>
  );
}

export const DecisionNode = memo(DecisionNodeComponent);
```

**Step 6: Create step-node.tsx** (for numbered step flows — pipeline steps)

```tsx
// src/components/flow/custom-nodes/step-node.tsx
"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

type StepNodeData = {
  label: string;
  step?: number;
  detail?: string;
  variant?: "default" | "success" | "warning" | "error";
};

type StepNode = Node<StepNodeData, "step">;

const variantStyles: Record<string, string> = {
  default: "bg-card border-border",
  success: "bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700",
  warning: "bg-yellow-50 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-700",
  error: "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700",
};

function StepNodeComponent({ data, selected }: NodeProps<StepNode>) {
  const v = data.variant ?? "default";

  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 min-w-[200px] ${variantStyles[v]} ${selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        {data.step !== undefined && (
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
            {data.step}
          </span>
        )}
        <span className="text-sm font-medium">{data.label}</span>
      </div>
      {data.detail && (
        <div className="text-xs text-muted-foreground mt-1 ml-7">{data.detail}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

export const StepNode = memo(StepNodeComponent);
```

**Step 7: Create labeled-edge.tsx**

```tsx
// src/components/flow/custom-edges/labeled-edge.tsx
"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";

type LabeledEdgeData = { label: string };
type LabeledEdge = Edge<LabeledEdgeData, "labeled">;

function LabeledEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps<LabeledEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {data?.label && (
          <div
            className="nodrag nopan pointer-events-auto absolute rounded bg-background px-2 py-0.5 text-[10px] border shadow-sm text-muted-foreground"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {data.label}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const LabeledEdge = memo(LabeledEdgeComponent);
```

**Step 8: Create node-types.ts and edge-types.ts**

```tsx
// src/components/flow/node-types.ts
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
```

```tsx
// src/components/flow/edge-types.ts
import type { EdgeTypes } from "@xyflow/react";
import { LabeledEdge } from "./custom-edges/labeled-edge";

export const edgeTypes: EdgeTypes = {
  labeled: LabeledEdge,
};
```

**Step 9: Verify types**

```bash
cd apps/docs && bun run types:check
```

Expected: no errors.

**Step 10: Commit**

```bash
git add apps/docs/src/components/flow/
git commit -m "feat(docs): add react flow shared infrastructure"
```

---

### Task 3: Register flow components in MDX

**Files:**
- Modify: `apps/docs/src/components/mdx.tsx`

**Step 1: Add flow component exports to mdx.tsx**

Replace the entire file:

```tsx
// src/components/mdx.tsx
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { FlowProvider } from "@/components/flow/flow-provider";
import { ArchitectureDiagram } from "@/components/flow/diagrams/architecture-diagram";
import { SyncModesDiagram } from "@/components/flow/diagrams/sync-modes-diagram";
import { SyncEngineDiagram } from "@/components/flow/diagrams/sync-engine-diagram";
import { TroubleshootingDiagram } from "@/components/flow/diagrams/troubleshooting-diagram";
import { EventFlowDiagram } from "@/components/flow/diagrams/event-flow-diagram";
import { SyncLifecycleDiagram } from "@/components/flow/diagrams/sync-lifecycle-diagram";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...components,
    FlowProvider,
    ArchitectureDiagram,
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
```

> Note: The diagram components don't exist yet. They'll be created in Tasks 4-9. We commit this together with each diagram to avoid broken imports.

---

## Diagram Components (Tasks 4-9)

Each task creates one diagram component and updates its corresponding MDX file. Commit after each.

### Task 4: Architecture Diagram (architecture.mdx)

**Replaces:** The ASCII art in `architecture.mdx` lines 10-42 (3-layer architecture: React App → Tauri Plugin → Server with sub-components).

**Files:**
- Create: `apps/docs/src/components/flow/diagrams/architecture-diagram.tsx`
- Modify: `apps/docs/content/docs/architecture.mdx`

**Step 1: Create the diagram component**

The architecture has 3 layers, each containing sub-components. The flow should be:
- **React App** layer: React Query, SyncClient Provider, Drizzle Proxy DB — all connecting down to Tauri Plugin
- **Tauri Plugin** layer: SQLite Pool, Sync Engine, Migration Runner — connecting down to Server
- **Server** layer: /status, /pull, /push routes, Server Database

Use `layer` node type for the 3 main layers, `component` node type for sub-components inside. Use `labeled` edges to show data flow direction (invoke, HTTP, events).

```tsx
// src/components/flow/diagrams/architecture-diagram.tsx
"use client";

import { FlowProvider } from "@/components/flow/flow-provider";
import { BasicFlow } from "@/components/flow/basic-flow";
import { nodeTypes } from "@/components/flow/node-types";
import { edgeTypes } from "@/components/flow/edge-types";
import type { Node, Edge } from "@xyflow/react";

const nodes: Node[] = [
  { id: "react-app", type: "layer", position: { x: 200, y: 0 }, data: { label: "React App", color: "bg-blue-50 dark:bg-blue-950" } },
  { id: "react-query", type: "component", position: { x: 0, y: 80 }, data: { label: "React Query", sublabel: "cache layer" } },
  { id: "sync-client", type: "component", position: { x: 200, y: 80 }, data: { label: "SyncClient", sublabel: "provider" } },
  { id: "drizzle-proxy", type: "component", position: { x: 400, y: 80 }, data: { label: "Drizzle", sublabel: "proxy DB" } },

  { id: "tauri-plugin", type: "layer", position: { x: 200, y: 220 }, data: { label: "Tauri Plugin", sublabel: "Rust", color: "bg-purple-50 dark:bg-purple-950" } },
  { id: "sqlite-pool", type: "component", position: { x: 0, y: 300 }, data: { label: "SQLite Pool" } },
  { id: "sync-engine", type: "component", position: { x: 200, y: 300 }, data: { label: "Sync Engine", sublabel: "status · push · pull · gc" } },
  { id: "migration-runner", type: "component", position: { x: 400, y: 300 }, data: { label: "Migration Runner" } },

  { id: "server", type: "layer", position: { x: 200, y: 440 }, data: { label: "Server", sublabel: "Hono", color: "bg-green-50 dark:bg-green-950" } },
  { id: "status-route", type: "component", position: { x: 0, y: 520 }, data: { label: "/status" } },
  { id: "pull-route", type: "component", position: { x: 150, y: 520 }, data: { label: "/pull" } },
  { id: "push-route", type: "component", position: { x: 300, y: 520 }, data: { label: "/push" } },
  { id: "server-db", type: "component", position: { x: 150, y: 600 }, data: { label: "Server DB", sublabel: "SQLite / Postgres" } },
];

const edges: Edge[] = [
  { id: "e-react-query-plugin", source: "react-query", target: "tauri-plugin", type: "labeled", data: { label: "invoke" } },
  { id: "e-sync-client-plugin", source: "sync-client", target: "sync-engine", type: "labeled", data: { label: "commands" } },
  { id: "e-drizzle-plugin", source: "drizzle-proxy", target: "sqlite-pool", type: "labeled", data: { label: "SQL via IPC" } },
  { id: "e-engine-status", source: "sync-engine", target: "status-route", type: "labeled", data: { label: "HTTP" } },
  { id: "e-engine-pull", source: "sync-engine", target: "pull-route", type: "labeled", data: { label: "HTTP" } },
  { id: "e-engine-push", source: "sync-engine", target: "push-route", type: "labeled", data: { label: "HTTP" } },
  { id: "e-pool-engine", source: "sqlite-pool", target: "sync-engine", type: "labeled", data: { label: "read/write" } },
  { id: "e-migration-pool", source: "migration-runner", target: "sqlite-pool" },
  { id: "e-status-db", source: "status-route", target: "server-db" },
  { id: "e-pull-db", source: "pull-route", target: "server-db" },
  { id: "e-push-db", source: "push-route", target: "server-db" },
];

export function ArchitectureDiagram() {
  return (
    <FlowProvider>
      <BasicFlow initialNodes={nodes} initialEdges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} />
    </FlowProvider>
  );
}
```

**Step 2: Update architecture.mdx**

Replace the ASCII art block (lines 10-42) with:

```mdx
<ArchitectureDiagram />
```

Keep the rest of the file unchanged.

**Step 3: Run typecheck**

```bash
cd apps/docs && bun run types:check
```

**Step 4: Verify visually**

```bash
cd apps/docs && bun dev
```

Open `/docs/architecture` and confirm the interactive diagram renders.

**Step 5: Commit**

```bash
git add apps/docs/src/components/flow/diagrams/architecture-diagram.tsx apps/docs/content/docs/architecture.mdx apps/docs/src/components/mdx.tsx
git commit -m "feat(docs): replace architecture ASCII art with react flow diagram"
```

---

### Task 5: Sync Modes Decision Tree (sync-engine/sync-modes.mdx)

**Replaces:** The decision logic ASCII tree in `sync-modes.mdx` lines 10-24.

**Files:**
- Create: `apps/docs/src/components/flow/diagrams/sync-modes-diagram.tsx`
- Modify: `apps/docs/content/docs/sync-engine/sync-modes.mdx`

**Step 1: Create the diagram component**

This is a decision tree: `sync_now()` → check baseline → check dirty count + server changes → 5 modes.

Use `decision` nodes for condition checks, `step` nodes for the 5 outcome modes.

```tsx
// src/components/flow/diagrams/sync-modes-diagram.tsx
"use client";

import { FlowProvider } from "@/components/flow/flow-provider";
import { BasicFlow } from "@/components/flow/basic-flow";
import { nodeTypes } from "@/components/flow/node-types";
import { edgeTypes } from "@/components/flow/edge-types";
import type { Node, Edge } from "@xyflow/react";

const nodes: Node[] = [
  { id: "sync-now", type: "layer", position: { x: 280, y: 0 }, data: { label: "sync_now()", color: "bg-blue-50 dark:bg-blue-950" } },

  { id: "check-baseline", type: "decision", position: { x: 250, y: 120 }, data: { label: "needs_baseline_sync?" } },
  { id: "full-resync", type: "step", position: { x: 0, y: 260 }, data: { label: "FullResync", detail: "Pull from empty cursor, then push", variant: "warning" } },

  { id: "check-dirty", type: "decision", position: { x: 250, y: 300 }, data: { label: "local dirty > 0?" } },
  { id: "check-server", type: "decision", position: { x: 250, y: 460 }, data: { label: "server has changes?" } },

  { id: "noop", type: "step", position: { x: 0, y: 430 }, data: { label: "NoOp", detail: "Both sides up to date", variant: "success" } },
  { id: "push-only", type: "step", position: { x: 500, y: 430 }, data: { label: "PushOnly", detail: "Push outbox, reconcile rejects" } },
  { id: "pull-only", type: "step", position: { x: 0, y: 600 }, data: { label: "PullOnly", detail: "Pull from cursor, update local" } },
  { id: "full-sync", type: "step", position: { x: 500, y: 600 }, data: { label: "FullSync", detail: "Pull first, then push, reconcile", variant: "warning" } },
];

const edges: Edge[] = [
  { id: "e-now-baseline", source: "sync-now", target: "check-baseline" },
  { id: "e-baseline-yes", source: "check-baseline", sourceHandle: "right", target: "full-resync", type: "labeled", data: { label: "yes" } },
  { id: "e-baseline-no", source: "check-baseline", sourceHandle: "no", target: "check-dirty", type: "labeled", data: { label: "no" } },
  { id: "e-dirty-no", source: "check-dirty", sourceHandle: "yes", target: "noop", type: "labeled", data: { label: "dirty = 0" } },
  { id: "e-dirty-yes", source: "check-dirty", sourceHandle: "no", target: "check-server", type: "labeled", data: { label: "dirty > 0" } },
  { id: "e-server-no-dirty", source: "check-dirty", sourceHandle: "yes", target: "check-server", type: "labeled", data: { label: "dirty = 0" } },
  { id: "e-dirty-yes-server-no", source: "check-dirty", sourceHandle: "no", target: "push-only", type: "labeled", data: { label: "dirty > 0" } },
  { id: "e-server-yes-pull", source: "check-server", sourceHandle: "yes", target: "pull-only", type: "labeled", data: { label: "has changes" } },
  { id: "e-server-yes-full", source: "check-server", sourceHandle: "no", target: "full-sync", type: "labeled", data: { label: "has changes" } },
  { id: "e-server-no-noop", source: "check-server", sourceHandle: "yes", target: "noop", type: "labeled", data: { label: "no changes" } },
  { id: "e-server-no-push", source: "check-server", sourceHandle: "no", target: "push-only", type: "labeled", data: { label: "no changes" } },
];

export function SyncModesDiagram() {
  return (
    <FlowProvider>
      <BasicFlow initialNodes={nodes} initialEdges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} className="h-[500px] w-full" />
    </FlowProvider>
  );
}
```

**Step 2: Update sync-modes.mdx**

Replace the ASCII decision tree block (lines 10-26 — the ```txt block and the paragraph after it) with:

```mdx
<SyncModesDiagram />
```

Keep everything else (mode summary, when to use, result mode sections).

**Step 3: Run typecheck, verify visually, commit**

```bash
cd apps/docs && bun run types:check && bun dev
```

```bash
git add apps/docs/src/components/flow/diagrams/sync-modes-diagram.tsx apps/docs/content/docs/sync-engine/sync-modes.mdx
git commit -m "feat(docs): replace sync modes ASCII tree with react flow diagram"
```

---

### Task 6: Sync Engine Overview (sync-engine/overview.mdx)

**Replaces:** The architecture ASCII art in `sync-engine/overview.mdx` lines 22-46.

**Files:**
- Create: `apps/docs/src/components/flow/diagrams/sync-engine-diagram.tsx`
- Modify: `apps/docs/content/docs/sync-engine/overview.mdx`

**Step 1: Create the diagram component**

Shows: JS Client ↔ Tauri Plugin ↔ Server horizontal flow, with Engine and SQLite stacked below the plugin.

```tsx
// src/components/flow/diagrams/sync-engine-diagram.tsx
"use client";

import { FlowProvider } from "@/components/flow/flow-provider";
import { BasicFlow } from "@/components/flow/basic-flow";
import { nodeTypes } from "@/components/flow/node-types";
import { edgeTypes } from "@/components/flow/edge-types";
import type { Node, Edge } from "@xyflow/react";

const nodes: Node[] = [
  { id: "js-client", type: "layer", position: { x: 0, y: 80 }, data: { label: "JS Client", sublabel: "SyncClient", color: "bg-blue-50 dark:bg-blue-950" } },
  { id: "tauri-plugin", type: "layer", position: { x: 260, y: 80 }, data: { label: "Tauri Plugin", sublabel: "Rust", color: "bg-purple-50 dark:bg-purple-950" } },
  { id: "server", type: "layer", position: { x: 520, y: 80 }, data: { label: "Server", sublabel: "Routes", color: "bg-green-50 dark:bg-green-950" } },

  { id: "engine", type: "component", position: { x: 260, y: 200 }, data: { label: "Sync Engine", sublabel: "status · push · pull · gc" } },
  { id: "sqlite", type: "component", position: { x: 260, y: 320 }, data: { label: "SQLite", sublabel: "tables · outbox · cursors" } },
];

const edges: Edge[] = [
  { id: "e-client-plugin", source: "js-client", target: "tauri-plugin", type: "labeled", data: { label: "commands" } },
  { id: "e-plugin-client", source: "tauri-plugin", target: "js-client", type: "labeled", data: { label: "events" } },
  { id: "e-plugin-server", source: "tauri-plugin", target: "server", type: "labeled", data: { label: "HTTP" } },
  { id: "e-server-plugin", source: "server", target: "tauri-plugin", type: "labeled", data: { label: "response" } },
  { id: "e-plugin-engine", source: "tauri-plugin", target: "engine" },
  { id: "e-engine-sqlite", source: "engine", target: "sqlite" },
];

export function SyncEngineDiagram() {
  return (
    <FlowProvider>
      <BasicFlow initialNodes={nodes} initialEdges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} className="h-[450px] w-full" />
    </FlowProvider>
  );
}
```

**Step 2: Update sync-engine/overview.mdx**

Replace the ASCII architecture block (lines 22-46 — the ```txt block and surrounding "## Architecture" section) with:

```mdx
## Architecture

<SyncEngineDiagram />
```

**Step 3: Run typecheck, verify, commit**

```bash
cd apps/docs && bun run types:check && bun dev
git add apps/docs/src/components/flow/diagrams/sync-engine-diagram.tsx apps/docs/content/docs/sync-engine/overview.mdx
git commit -m "feat(docs): replace sync engine overview ASCII art with react flow diagram"
```

---

### Task 7: Troubleshooting Diagnostic Flowchart (running-in-production/troubleshooting.mdx)

**Replaces:** The diagnostic flowchart section in `troubleshooting.mdx` lines 87-143.

**Files:**
- Create: `apps/docs/src/components/flow/diagrams/troubleshooting-diagram.tsx`
- Modify: `apps/docs/content/docs/running-in-production/troubleshooting.mdx`

**Step 1: Create the diagram component**

5-step linear diagnostic with branches:
1. Check local state → dirty count branch
2. Check push → 4 outcomes
3. Check pull on other device
4. Check server
5. Nuclear option (fullResync)

```tsx
// src/components/flow/diagrams/troubleshooting-diagram.tsx
"use client";

import { FlowProvider } from "@/components/flow/flow-provider";
import { BasicFlow } from "@/components/flow/basic-flow";
import { nodeTypes } from "@/components/flow/node-types";
import { edgeTypes } from "@/components/flow/edge-types";
import type { Node, Edge } from "@xyflow/react";

const nodes: Node[] = [
  { id: "step1", type: "step", position: { x: 200, y: 0 }, data: { step: 1, label: "Check local state", detail: "client.getState()" } },
  { id: "dirty-check", type: "decision", position: { x: 200, y: 120 }, data: { label: "dirty_count > 0?" } },
  { id: "dirty-yes", type: "step", position: { x: 0, y: 250 }, data: { label: "Changes not pushed yet", detail: "Continue to Step 2", variant: "warning" } },
  { id: "dirty-no", type: "step", position: { x: 420, y: 250 }, data: { label: "Changes were pushed", detail: "Continue to Step 3", variant: "success" } },

  { id: "step2", type: "step", position: { x: 0, y: 370 }, data: { step: 2, label: "Check push result", detail: "client.syncNow()" } },
  { id: "push-synced", type: "step", position: { x: -200, y: 490 }, data: { label: "Push succeeded", detail: "Server has data ✓", variant: "success" } },
  { id: "push-rejected", type: "step", position: { x: 0, y: 490 }, data: { label: "Tables rejected", detail: "Check server logs", variant: "error" } },
  { id: "push-missing", type: "step", position: { x: 200, y: 490 }, data: { label: "Push didn't run", variant: "warning" } },
  { id: "push-error", type: "step", position: { x: 400, y: 490 }, data: { label: "Push threw error", detail: "Check error type", variant: "error" } },

  { id: "step3", type: "step", position: { x: 420, y: 370 }, data: { step: 3, label: "Check pull on device", detail: "last_server_watermark" } },
  { id: "step4", type: "step", position: { x: 420, y: 490 }, data: { step: 4, label: "Check server", detail: "Query server DB directly" } },
  { id: "step5", type: "step", position: { x: 420, y: 610 }, data: { step: 5, label: "Nuclear option", detail: "client.fullResync()", variant: "error" } },
];

const edges: Edge[] = [
  { id: "e1-dirty", source: "step1", target: "dirty-check" },
  { id: "e-dirty-yes", source: "dirty-check", sourceHandle: "yes", target: "dirty-yes", type: "labeled", data: { label: "yes" } },
  { id: "e-dirty-no", source: "dirty-check", sourceHandle: "no", target: "dirty-no", type: "labeled", data: { label: "no" } },
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
      <BasicFlow initialNodes={nodes} initialEdges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} className="h-[700px] w-full" />
    </FlowProvider>
  );
}
```

**Step 2: Update troubleshooting.mdx**

Replace lines 87-143 (the `## Diagnostic flowchart` section with all 5 steps and their code blocks) with:

```mdx
## Diagnostic flowchart: "My data isn't syncing"

<TroubleshootingDiagram />
```

Keep the "Common failure patterns" section and everything after.

**Step 3: Run typecheck, verify, commit**

```bash
cd apps/docs && bun run types:check && bun dev
git add apps/docs/src/components/flow/diagrams/troubleshooting-diagram.tsx apps/docs/content/docs/running-in-production/troubleshooting.mdx
git commit -m "feat(docs): replace troubleshooting flowchart with react flow diagram"
```

---

### Task 8: Event Flow (reference/events.mdx)

**Replaces:** The event flow ASCII art in `events.mdx` lines 78-99.

**Files:**
- Create: `apps/docs/src/components/flow/diagrams/event-flow-diagram.tsx`
- Modify: `apps/docs/content/docs/reference/events.mdx`

**Step 1: Create the diagram component**

Linear pipeline: User writes → writeTransaction → run_sql → emit data-changed → notify polling → syncNow → push/pull → emit events.

```tsx
// src/components/flow/diagrams/event-flow-diagram.tsx
"use client";

import { FlowProvider } from "@/components/flow/flow-provider";
import { BasicFlow } from "@/components/flow/basic-flow";
import { nodeTypes } from "@/components/flow/node-types";
import { edgeTypes } from "@/components/flow/edge-types";
import type { Node, Edge } from "@xyflow/react";

const nodes: Node[] = [
  { id: "user-writes", type: "layer", position: { x: 180, y: 0 }, data: { label: "User writes data", color: "bg-blue-50 dark:bg-blue-950" } },
  { id: "write-tx", type: "step", position: { x: 180, y: 100 }, data: { label: "writeTransaction", detail: "writeLocalChange()" } },
  { id: "run-sql", type: "step", position: { x: 180, y: 200 }, data: { label: "run_sql", detail: "insert row + insert outbox entry" } },
  { id: "emit-data", type: "step", position: { x: 0, y: 300 }, data: { label: "emit data-changed", detail: "UI re-fetches", variant: "success" } },
  { id: "notify-polling", type: "step", position: { x: 180, y: 300 }, data: { label: "Notify polling loop" } },
  { id: "sync-now", type: "step", position: { x: 180, y: 400 }, data: { label: "syncNow()", detail: "push → pull" } },
  { id: "emit-status", type: "step", position: { x: 0, y: 500 }, data: { label: "emit sync-status-changed", variant: "success" } },
  { id: "emit-data2", type: "step", position: { x: 360, y: 500 }, data: { label: "emit data-changed", detail: "UI re-fetches with server data", variant: "success" } },
  { id: "emit-status2", type: "step", position: { x: 180, y: 600 }, data: { label: "emit sync-status-changed", variant: "success" } },
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
      <BasicFlow initialNodes={nodes} initialEdges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} className="h-[650px] w-full" />
    </FlowProvider>
  );
}
```

**Step 2: Update events.mdx**

Replace lines 78-99 (the `## Event flow in a typical app` section with the ```txt block) with:

```mdx
## Event flow in a typical app

<EventFlowDiagram />
```

**Step 3: Run typecheck, verify, commit**

```bash
cd apps/docs && bun run types:check && bun dev
git add apps/docs/src/components/flow/diagrams/event-flow-diagram.tsx apps/docs/content/docs/reference/events.mdx
git commit -m "feat(docs): replace event flow ASCII art with react flow diagram"
```

---

### Task 9: Sync Lifecycle (running-in-production/overview.mdx)

**Replaces:** The sync lifecycle ASCII art in `running-in-production/overview.mdx` lines 10-33.

**Files:**
- Create: `apps/docs/src/components/flow/diagrams/sync-lifecycle-diagram.tsx`
- Modify: `apps/docs/content/docs/running-in-production/overview.mdx`

**Step 1: Create the diagram component**

Two phases side by side:
1. App start → migrations → plugin connects
2. User edits → write to DB → writeLocalChange → outbox
3. Polling tick → read dirty → check server → push/pull → GC → dirty count = 0

```tsx
// src/components/flow/diagrams/sync-lifecycle-diagram.tsx
"use client";

import { FlowProvider } from "@/components/flow/flow-provider";
import { BasicFlow } from "@/components/flow/basic-flow";
import { nodeTypes } from "@/components/flow/node-types";
import { edgeTypes } from "@/components/flow/edge-types";
import type { Node, Edge } from "@xyflow/react";

const nodes: Node[] = [
  { id: "app-start", type: "layer", position: { x: 180, y: 0 }, data: { label: "App starts", color: "bg-blue-50 dark:bg-blue-950" } },
  { id: "migrations", type: "step", position: { x: 180, y: 100 }, data: { label: "Migrations run", detail: "automatically" } },
  { id: "plugin-connect", type: "step", position: { x: 180, y: 190 }, data: { label: "Plugin connects to SQLite" } },

  { id: "user-edits", type: "layer", position: { x: 180, y: 300 }, data: { label: "User creates/edits data", color: "bg-blue-50 dark:bg-blue-950" } },
  { id: "write-db", type: "step", position: { x: 100, y: 400 }, data: { label: "Write to local DB" } },
  { id: "write-local-change", type: "step", position: { x: 300, y: 400 }, data: { label: "writeLocalChange()" } },
  { id: "outbox", type: "step", position: { x: 300, y: 490 }, data: { label: "sync_outbox entry", detail: "dirty count increases", variant: "warning" } },

  { id: "polling", type: "layer", position: { x: 180, y: 600 }, data: { label: "Polling tick / syncNow()", color: "bg-purple-50 dark:bg-purple-950" } },
  { id: "read-dirty", type: "step", position: { x: 0, y: 700 }, data: { label: "Read dirty outbox" } },
  { id: "check-server", type: "step", position: { x: 200, y: 700 }, data: { label: "Check server changes", detail: "since last cursor" } },
  { id: "push", type: "step", position: { x: 100, y: 800 }, data: { label: "Push to server", detail: "if dirty rows exist" } },
  { id: "pull", type: "step", position: { x: 300, y: 800 }, data: { label: "Pull from server", detail: "if server has changes" } },
  { id: "gc", type: "step", position: { x: 200, y: 900 }, data: { label: "Garbage collection", detail: "remove synced soft-deletes" } },
  { id: "clean", type: "step", position: { x: 200, y: 990 }, data: { label: "Dirty count = 0", variant: "success" } },
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
      <BasicFlow initialNodes={nodes} initialEdges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} className="h-[700px] w-full" />
    </FlowProvider>
  );
}
```

**Step 2: Update running-in-production/overview.mdx**

Replace lines 10-33 (the `## The sync lifecycle at runtime` section with the ```txt block) with:

```mdx
## The sync lifecycle at runtime

Every time your app syncs, this is what happens:

<SyncLifecycleDiagram />
```

**Step 3: Run typecheck, verify, commit**

```bash
cd apps/docs && bun run types:check && bun dev
git add apps/docs/src/components/flow/diagrams/sync-lifecycle-diagram.tsx apps/docs/content/docs/running-in-production/overview.mdx
git commit -m "feat(docs): replace sync lifecycle ASCII art with react flow diagram"
```

---

### Task 10: Final lint and verify all diagrams

**Step 1: Run Ultracite check**

```bash
cd apps/docs && bun x ultracite check
```

If formatting or safe-fixable issues found:

```bash
cd apps/docs && bun x ultracite fix
```

Then re-run check.

**Step 2: Run typecheck**

```bash
cd apps/docs && bun run types:check
```

**Step 3: Build**

```bash
cd apps/docs && bun run build
```

**Step 4: Manual verification**

```bash
cd apps/docs && bun dev
```

Visit all 6 pages and confirm each renders its interactive diagram:
1. `/docs/architecture`
2. `/docs/sync-engine/sync-modes`
3. `/docs/sync-engine/overview`
4. `/docs/running-in-production/troubleshooting`
5. `/docs/reference/events`
6. `/docs/running-in-production`

**Step 5: Final commit if any fixes**

```bash
git add -A && git commit -m "chore(docs): lint and fix react flow diagrams"
```

---

## File tree summary

```
apps/docs/src/components/flow/
├── flow-provider.tsx
├── basic-flow.tsx
├── node-types.ts
├── edge-types.ts
├── custom-nodes/
│   ├── layer-node.tsx
│   ├── component-node.tsx
│   ├── decision-node.tsx
│   └── step-node.tsx
├── custom-edges/
│   └── labeled-edge.tsx
└── diagrams/
    ├── architecture-diagram.tsx
    ├── sync-modes-diagram.tsx
    ├── sync-engine-diagram.tsx
    ├── troubleshooting-diagram.tsx
    ├── event-flow-diagram.tsx
    └── sync-lifecycle-diagram.tsx
```

Modified existing files:
- `apps/docs/src/styles/app.css` — add @xyflow/react CSS import
- `apps/docs/src/components/mdx.tsx` — register diagram components
- `apps/docs/content/docs/architecture.mdx`
- `apps/docs/content/docs/sync-engine/sync-modes.mdx`
- `apps/docs/content/docs/sync-engine/overview.mdx`
- `apps/docs/content/docs/running-in-production/troubleshooting.mdx`
- `apps/docs/content/docs/reference/events.mdx`
- `apps/docs/content/docs/running-in-production/overview.mdx`
