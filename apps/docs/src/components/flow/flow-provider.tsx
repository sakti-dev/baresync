"use client";

import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";

interface FlowProviderProps {
  children: ReactNode;
}

export function FlowProvider({ children }: FlowProviderProps) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}
