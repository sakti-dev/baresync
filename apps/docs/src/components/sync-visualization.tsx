"use client";

import { Laptop, Server, Smartphone } from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/utils";
import { AnimatedBeam } from "./animated-beam";
import { Circle } from "./circle";

export function SyncVisualization({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const deviceARef = useRef<HTMLDivElement>(null);
  const serverRef = useRef<HTMLDivElement>(null);
  const deviceBRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={cn(
        "relative flex h-87.5 w-full items-center justify-center overflow-hidden border-fd-border border-b p-10",
        className
      )}
      ref={containerRef}
    >
      <div className="flex size-full max-w-2xl flex-row items-center justify-between">
        <div className="flex flex-col items-center gap-2">
          <Circle className="size-16" ref={deviceARef}>
            <Laptop className="size-6 text-fd-foreground" />
          </Circle>
          <span className="font-medium text-fd-foreground text-sm">
            Device A
          </span>
          <span className="text-fd-muted-foreground text-xs">
            Local DB + Outbox
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Circle className="size-20 border-fd-primary/50" ref={serverRef}>
            <Server className="size-8 text-fd-primary" />
          </Circle>
          <span className="font-medium text-fd-foreground text-sm">
            Baresync Server
          </span>
          <span className="text-fd-muted-foreground text-xs">
            Status / Push / Pull
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Circle className="size-16" ref={deviceBRef}>
            <Smartphone className="size-6 text-fd-foreground" />
          </Circle>
          <span className="font-medium text-fd-foreground text-sm">
            Device B
          </span>
          <span className="text-fd-muted-foreground text-xs">
            Local DB + Outbox
          </span>
        </div>
      </div>

      <AnimatedBeam
        containerRef={containerRef}
        curvature={-50}
        delay={0}
        duration={3}
        fromRef={deviceARef}
        gradientStartColor="#6bc725"
        gradientStopColor="#3d8a0e"
        pathColor="rgba(107, 199, 37, 0.1)"
        pathWidth={2}
        toRef={serverRef}
      />
      <AnimatedBeam
        containerRef={containerRef}
        curvature={50}
        delay={1}
        duration={3}
        fromRef={serverRef}
        gradientStartColor="#3da2e0"
        gradientStopColor="#2563eb"
        pathColor="rgba(61, 162, 224, 0.1)"
        pathWidth={2}
        toRef={deviceBRef}
      />
      <AnimatedBeam
        containerRef={containerRef}
        curvature={-50}
        delay={2}
        duration={4}
        fromRef={serverRef}
        gradientStartColor="#9d9ea1"
        gradientStopColor="#6b7280"
        pathColor="rgba(157, 158, 161, 0.05)"
        pathWidth={1}
        reverse={true}
        toRef={deviceARef}
      />
      <AnimatedBeam
        containerRef={containerRef}
        curvature={-50}
        delay={2.5}
        duration={3}
        fromRef={deviceBRef}
        gradientStartColor="#6bc725"
        gradientStopColor="#3d8a0e"
        pathColor="rgba(107, 199, 37, 0.1)"
        pathWidth={2}
        reverse={true}
        toRef={serverRef}
      />
      <AnimatedBeam
        containerRef={containerRef}
        curvature={-50}
        delay={4}
        duration={4}
        fromRef={serverRef}
        gradientStartColor="#9d9ea1"
        gradientStopColor="#6b7280"
        pathColor="rgba(157, 158, 161, 0.05)"
        pathWidth={1}
        toRef={deviceBRef}
      />
      <AnimatedBeam
        containerRef={containerRef}
        curvature={50}
        delay={3.5}
        duration={3}
        fromRef={serverRef}
        gradientStartColor="#3da2e0"
        gradientStopColor="#2563eb"
        pathColor="rgba(61, 162, 224, 0.1)"
        pathWidth={2}
        toRef={deviceARef}
      />
    </div>
  );
}
