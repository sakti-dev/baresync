"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  MiniMap,
  type Node,
  type NodeChange,
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

  const defaultEdgeOptions = useMemo(
    () => ({
      animated: true,
      type: "smoothstep",
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
    <div className={className ?? "h-[600px] w-full"}>
      <ReactFlow
        colorMode={colorMode}
        defaultEdgeOptions={defaultEdgeOptions}
        edges={edges}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1.2 }}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <MiniMap className="hidden md:block" />
        <Background gap={16} size={1} />
        {children}
      </ReactFlow>
    </div>
  );
}
