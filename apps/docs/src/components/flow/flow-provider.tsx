"use client";

import { ReactFlowProvider } from "@xyflow/react";
import type { ReactNode } from "react";

type FlowProviderProps = {
  children: ReactNode;
};

export function FlowProvider({ children }: FlowProviderProps) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}
