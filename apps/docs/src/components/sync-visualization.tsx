"use client";

import { useRef } from "react";
import { Laptop, Server, Smartphone } from "lucide-react";

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
				"relative flex h-[400px] w-full items-center justify-center overflow-hidden border-fd-border border-b p-10",
				className,
			)}
			ref={containerRef}
		>
			<div className="flex size-full max-w-2xl flex-row items-center justify-between">
				<div className="flex flex-col items-center gap-2">
					<Circle ref={deviceARef} className="size-16">
						<Laptop className="size-6 text-fd-foreground" />
					</Circle>
					<span className="text-sm font-medium text-fd-foreground">
						Your App
					</span>
					<span className="text-xs text-fd-muted-foreground">
						Local DB + Outbox
					</span>
				</div>

				<div className="flex flex-col items-center gap-2">
					<Circle ref={serverRef} className="size-20 border-fd-primary/50">
						<Server className="size-8 text-fd-primary" />
					</Circle>
					<span className="text-sm font-medium text-fd-foreground">
						Baresync Server
					</span>
					<span className="text-xs text-fd-muted-foreground">
						Status / Push / Pull
					</span>
				</div>

				<div className="flex flex-col items-center gap-2">
					<Circle ref={deviceBRef} className="size-16">
						<Smartphone className="size-6 text-fd-foreground" />
					</Circle>
					<span className="text-sm font-medium text-fd-foreground">
						Their App
					</span>
					<span className="text-xs text-fd-muted-foreground">
						Local DB + Outbox
					</span>
				</div>
			</div>

			<AnimatedBeam
				containerRef={containerRef}
				fromRef={deviceARef}
				toRef={serverRef}
				curvature={-50}
				duration={3}
				delay={0}
				gradientStartColor="#6bc725"
				gradientStopColor="#3d8a0e"
				pathColor="rgba(107, 199, 37, 0.1)"
				pathWidth={2}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				fromRef={serverRef}
				toRef={deviceBRef}
				curvature={50}
				duration={3}
				delay={1}
				gradientStartColor="#3da2e0"
				gradientStopColor="#2563eb"
				pathColor="rgba(61, 162, 224, 0.1)"
				pathWidth={2}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				fromRef={serverRef}
				toRef={deviceARef}
				curvature={-50}
				duration={4}
				delay={2}
				reverse={true}
				gradientStartColor="#9d9ea1"
				gradientStopColor="#6b7280"
				pathColor="rgba(157, 158, 161, 0.05)"
				pathWidth={1}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				fromRef={deviceBRef}
				toRef={serverRef}
				curvature={-50}
				duration={3}
				delay={2.5}
				reverse={true}
				gradientStartColor="#6bc725"
				gradientStopColor="#3d8a0e"
				pathColor="rgba(107, 199, 37, 0.1)"
				pathWidth={2}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				fromRef={serverRef}
				toRef={deviceBRef}
				curvature={-50}
				duration={4}
				delay={4}
				gradientStartColor="#9d9ea1"
				gradientStopColor="#6b7280"
				pathColor="rgba(157, 158, 161, 0.05)"
				pathWidth={1}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				fromRef={serverRef}
				toRef={deviceARef}
				curvature={50}
				duration={3}
				delay={3.5}
				gradientStartColor="#3da2e0"
				gradientStopColor="#2563eb"
				pathColor="rgba(61, 162, 224, 0.1)"
				pathWidth={2}
			/>
		</div>
	);
}
