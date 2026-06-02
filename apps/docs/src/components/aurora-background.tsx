"use client";

import type { Transition } from "motion/react";
import { motion, useAnimationControls } from "motion/react";
import type React from "react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

interface WaveProps {
  animate: {
    opacity?: number[];
    scale?: number[];
    x?: number[];
    y?: number[];
  };
  className: string;
  id: string;
  path: string;
  style: React.CSSProperties;
  transition: Transition;
  viewBox: string;
}

const WAVES: WaveProps[] = [
  {
    id: "upper-left-wave",
    className:
      "left-[-18%] top-[-18%] h-[44rem] w-[58rem] sm:h-[52rem] sm:w-[68rem]",
    animate: {
      opacity: [0.54, 0.68, 0.58, 0.54],
      scale: [1, 1.08, 0.94, 1],
      x: [0, 180, -145, 0],
      y: [0, -142, 112, 0],
    },
    style: {
      color: "rgba(184, 255, 87, 0.92)",
    },
    transition: {
      duration: 4.8,
      ease: "easeInOut",
      repeat: Number.POSITIVE_INFINITY,
    },
    viewBox: "0 0 1440 560",
    path: "M0,510.728C98.261,512.28,197.838,489.442,278.134,432.784C356.705,377.343,395.874,286.414,439.411,200.672C484.785,111.313,551.941,21.891,537.101,-77.223C522.276,-176.234,433.694,-243.741,362.353,-313.98C296.093,-379.217,228.279,-447.69,138.04,-470.122C49.48,-492.136,-40.839,-462.95,-127.983,-435.869C-213.897,-409.17,-293.987,-372.293,-362.895,-314.45C-441.594,-248.389,-529.368,-179.543,-552.585,-79.45C-576.34,22.963,-538.569,130.741,-487.471,222.62C-438.758,310.211,-358.828,373.094,-272.545,424.089C-188.782,473.595,-97.287,509.192,0,510.728",
  },
  {
    id: "upper-right-wave",
    className:
      "right-[-16%] top-[6%] h-[36rem] w-[58rem] sm:h-[46rem] sm:w-[70rem]",
    animate: {
      opacity: [0.34, 0.5, 0.38, 0.34],
      scale: [1, 1.1, 0.92, 1],
      x: [0, -190, 148, 0],
      y: [0, 132, -104, 0],
    },
    style: {
      color: "rgba(132, 214, 34, 0.78)",
    },
    transition: {
      duration: 5.4,
      ease: "easeInOut",
      repeat: Number.POSITIVE_INFINITY,
    },
    viewBox: "0 0 1440 560",
    path: "M1440 981.65C1541.508 992.726 1644.6109999999999 1065.44 1737.317 1022.635 1830.07 979.808 1877.318 869.48 1899.106 769.667 1918.916 678.915 1854.634 593.702 1851.214 500.876 1847.193 391.749 1944.789 266.917 1877.414 180.978 1811.0729999999999 96.358 1668.205 164.43400000000003 1564.677 135.389 1463.033 106.87299999999999 1381.022-15.552999999999997 1279.451 13.221000000000004 1178.077 41.938999999999965 1153.8899999999999 175.25099999999998 1101.424 266.622 1058.896 340.68600000000004 1023.4639999999999 414.399 1001.675 496.978 977.269 589.473 932.491 686.7909999999999 967.018 776.004 1001.894 866.1179999999999 1093.035 923.473 1181.649 962.001 1262.49 997.149 1352.369 972.088 1440 981.65",
  },
  {
    id: "lower-wave",
    className:
      "left-[12%] bottom-[-34%] h-[42rem] w-[70rem] sm:h-[54rem] sm:w-[84rem]",
    animate: {
      opacity: [0.26, 0.38, 0.3, 0.26],
      scale: [1, 1.06, 0.95, 1],
      x: [0, 170, -182, 0],
      y: [0, -112, 92, 0],
    },
    style: {
      color: "rgba(91, 161, 15, 0.62)",
    },
    transition: {
      duration: 6,
      ease: "easeInOut",
      repeat: Number.POSITIVE_INFINITY,
    },
    viewBox: "0 0 1440 560",
    path: "M0,0C98,15 173,78 255,141C333,201 413,259 503,296C588,331 685,345 777,322C870,299 960,241 1040,179C1124,113 1201,44 1285,6C1361,-28 1455,-26 1531,12C1607,50 1667,116 1718,193C1769,270 1810,358 1800,440C1790,522 1731,599 1650,635C1569,671 1466,665 1378,636C1289,606 1217,555 1136,503C1055,451 965,399 874,382C782,365 689,384 592,402C494,419 394,436 296,419C199,402 103,352 45,279C-13,206 -31,110 0,0Z",
  },
];

function firstKeyframe(values: number[] | undefined, fallback: number) {
  return values?.[0] ?? fallback;
}

function AuroraWave({
  reduceMotion,
  wave,
}: {
  reduceMotion: boolean;
  wave: WaveProps;
}) {
  const controls = useAnimationControls();

  useEffect(() => {
    if (reduceMotion) {
      controls.set({
        opacity: firstKeyframe(wave.animate.opacity, 1),
        scale: firstKeyframe(wave.animate.scale, 1),
        x: firstKeyframe(wave.animate.x, 0),
        y: firstKeyframe(wave.animate.y, 0),
      });
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      controls.start({
        opacity: wave.animate.opacity ?? 1,
        scale: wave.animate.scale ?? 1,
        transition: wave.transition,
        x: wave.animate.x ?? 0,
        y: wave.animate.y ?? 0,
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      controls.stop();
    };
  }, [controls, reduceMotion, wave]);

  return (
    <motion.div
      animate={controls}
      aria-hidden="true"
      className={cn(
        "absolute transform-gpu blur-[118px] will-change-transform",
        wave.className
      )}
      initial={{
        opacity: firstKeyframe(wave.animate.opacity, 1),
        scale: firstKeyframe(wave.animate.scale, 1),
        x: firstKeyframe(wave.animate.x, 0),
        y: firstKeyframe(wave.animate.y, 0),
      }}
      style={{
        ...wave.style,
        filter: "blur(108px)",
      }}
    >
      <svg
        aria-hidden="true"
        className="h-full w-full"
        preserveAspectRatio="none"
        viewBox={wave.viewBox}
      >
        <path d={wave.path} fill="currentColor" />
      </svg>
    </motion.div>
  );
}

export function AuroraBackground({
  className,
  children,
  showRadialGradient = false,
  ...props
}: AuroraBackgroundProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduceMotion(media.matches);
    };

    update();

    if (import.meta.env.DEV) {
      console.info("[AuroraBackground] motion state", {
        prefersReducedMotion: media.matches,
        waveCount: WAVES.length,
      });
    }

    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
    };
  }, []);

  return (
    <div className={cn("relative overflow-hidden", className)} {...props}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(160,255,63,0.12),transparent_34%),radial-gradient(ellipse_at_88%_34%,rgba(111,181,28,0.12),transparent_30%),radial-gradient(ellipse_at_72%_90%,rgba(76,138,20,0.1),transparent_28%),linear-gradient(180deg,rgba(5,8,7,1)_0%,rgba(7,12,9,0.98)_45%,rgba(4,7,5,1)_100%)]" />

        <div
          className="absolute inset-0 opacity-[0.14] mix-blend-overlay"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_18%,rgba(0,0,0,0.28)_100%)]" />

        {WAVES.map((wave) => (
          <AuroraWave key={wave.id} reduceMotion={reduceMotion} wave={wave} />
        ))}

        <div
          className={cn(
            "absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(255,255,255,0.05),transparent_44%)]",
            showRadialGradient &&
              "bg-[radial-gradient(ellipse_at_50%_50%,rgba(255,255,255,0.035),transparent_38%,rgba(2,8,4,0.46)_78%)]"
          )}
        />
      </div>

      {children}
    </div>
  );
}
