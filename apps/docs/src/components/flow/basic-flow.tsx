"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  type OnConnect,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { useTheme } from "fumadocs-ui/provider/base";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface BasicFlowProps {
  children?: ReactNode;
  className?: string;
  debugNodeLayout?: boolean;
  edgeTypes?: EdgeTypes;
  initialEdges: Edge[];
  initialNodes: Node[];
  nodeTypes?: NodeTypes;
}

export function BasicFlow({
  initialNodes,
  initialEdges,
  nodeTypes,
  edgeTypes,
  debugNodeLayout = false,
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
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    []
  );

  const onNodeDragStop: NodeMouseHandler = useCallback(() => {
    if (!debugNodeLayout) {
      return;
    }

    const snapshot = nodes.map((node) => ({
      id: node.id,
      type: node.type ?? "default",
      parentId: node.parentId ?? null,
      position: node.position,
      style: node.style ?? null,
    }));

    console.log("[flow layout snapshot]", snapshot);
  }, [debugNodeLayout, nodes]);

  const defaultEdgeOptions = useMemo(
    () => ({
      animated: false,
      type: "smoothstep",
      style: {
        strokeWidth: 1.75,
      },
    }),
    []
  );

  const colorMode = (() => {
    if (!mounted) {
      return "dark" as const;
    }
    if (resolvedTheme === "dark") {
      return "dark" as const;
    }
    if (resolvedTheme === "light") {
      return "light" as const;
    }
    return "dark" as const;
  })();

  return (
    <div
      className={
        className ??
        "h-[640px] w-full overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm"
      }
    >
      <ReactFlow
        colorMode={colorMode}
        defaultEdgeOptions={defaultEdgeOptions}
        edges={edges}
        edgeTypes={edgeTypes}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={debugNodeLayout}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} />
        {children}
      </ReactFlow>
    </div>
  );
}
