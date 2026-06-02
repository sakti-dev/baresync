"use client";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const BackgroundRippleEffect = ({
  rows = 10,
  cols = 27,
  cellSize = 56,
  clickedCell,
  hoveredCell,
}: {
  rows?: number;
  cols?: number;
  cellSize?: number;
  clickedCell?: { row: number; col: number } | null;
  hoveredCell?: { row: number; col: number } | null;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      className="relative flex w-full justify-center overflow-hidden"
      ref={ref}
      style={{ height: rows * cellSize }}
    >
      <div className="pointer-events-none absolute inset-0 z-2 h-full w-full overflow-hidden" />
      <DivGrid
        borderColor="oklch(0.83 0.18 120 / 0.2)"
        cellSize={cellSize}
        className="opacity-60"
        clickedCell={clickedCell ?? null}
        cols={cols}
        fillColor="oklch(0.83 0.18 120 / 0.1)"
        hoveredCell={hoveredCell ?? null}
        interactive={false}
        onCellClick={() => {}}
        rows={rows}
      />
    </div>
  );
};

export function useRipple() {
  const [clickedCell, setClickedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [rippleKey, setRippleKey] = useState(0);

  const triggerRipple = (row: number, col: number) => {
    setClickedCell({ row, col });
    setRippleKey((k) => k + 1);
  };

  return { clickedCell, hoveredCell, rippleKey, setHoveredCell, triggerRipple };
}

interface DivGridProps {
  borderColor: string;
  cellSize: number;
  className?: string;
  clickedCell: { row: number; col: number } | null;
  cols: number;
  fillColor: string;
  hoveredCell: { row: number; col: number } | null;
  interactive?: boolean;
  onCellClick?: (row: number, col: number) => void;
  rows: number;
}

type CellStyle = React.CSSProperties & {
  "--delay"?: string;
  "--duration"?: string;
};

const DivGrid = ({
  className,
  rows = 7,
  cols = 30,
  cellSize = 56,
  borderColor = "#3f3f46",
  fillColor = "rgba(14,165,233,0.3)",
  clickedCell = null,
  hoveredCell = null,
  onCellClick = () => {},
  interactive = true,
}: DivGridProps) => {
  const cells = useMemo(
    () => Array.from({ length: rows * cols }, (_, idx) => idx),
    [rows, cols]
  );

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
    width: cols * cellSize,
    height: rows * cellSize,
  };

  return (
    <div className={cn("relative z-3", className)} style={gridStyle}>
      {cells.map((idx) => {
        const rowIdx = Math.floor(idx / cols);
        const colIdx = idx % cols;
        const distance = clickedCell
          ? Math.hypot(clickedCell.row - rowIdx, clickedCell.col - colIdx)
          : 0;
        const delay = clickedCell ? Math.max(0, distance * 55) : 0;
        const duration = 200 + distance * 80;

        const style: CellStyle = clickedCell
          ? {
              "--delay": `${delay}ms`,
              "--duration": `${duration}ms`,
            }
          : {};

        const isHovered =
          hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx;

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: decorative background cells
          <div
            className={cn(
              "cell relative border-[0.5px] opacity-40 transition-opacity duration-150 will-change-transform dark:shadow-[0px_0px_40px_1px_var(--cell-shadow-color)_inset]",
              clickedCell && "animate-cell-ripple [animation-fill-mode:none]",
              !interactive && "pointer-events-none",
              isHovered && "opacity-80"
            )}
            key={idx}
            onClick={
              interactive ? () => onCellClick?.(rowIdx, colIdx) : undefined
            }
            onKeyDown={undefined}
            role="presentation"
            style={{
              backgroundColor: fillColor,
              borderColor,
              ...style,
            }}
          />
        );
      })}
    </div>
  );
};
