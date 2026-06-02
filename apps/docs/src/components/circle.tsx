import { forwardRef } from "react";

import { cn } from "@/lib/utils";

interface CircleProps {
	className?: string;
	children?: React.ReactNode;
}

export const Circle = forwardRef<HTMLDivElement, CircleProps>(
	({ className, children }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					"z-10 flex size-12 items-center justify-center rounded-full border border-fd-border bg-fd-card p-3",
					className,
				)}
			>
				{children}
			</div>
		);
	},
);

Circle.displayName = "Circle";
