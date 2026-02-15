"use client";

import Image from "next/image";
import { motion } from "framer-motion";

// Traces emanate from the ghost's tail area
const traces: [number, number][][] = [
  // Goes up
  [[150, 90], [180, 90], [195, 80], [235, 80]],
  // Goes slightly down
  [[155, 100], [190, 100], [205, 110], [250, 110]],
  // Goes up then up again
  [[150, 110], [185, 110], [200, 100], [240, 100], [250, 90], [280, 90]],
  // Goes down
  [[155, 120], [190, 120], [210, 132], [255, 132], [265, 139], [295, 139]],
  // Goes slightly up
  [[150, 130], [185, 130], [200, 120], [245, 120]],
];

function tracePath(points: [number, number][]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`)
    .join(" ");
}

function CircuitTrail() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 300 200"
      fill="none"
      style={{ zIndex: 0 }}
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {traces.map((points, i) => {
        const last = points[points.length - 1];
        const d = tracePath(points);
        return (
          <g key={i} filter="url(#glow)">
            <path
              d={d}
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.15}
            />
            <motion.path
              d={d}
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              initial={{ pathLength: 0, pathOffset: 0 }}
              animate={{
                pathLength: [0, 0.25, 0.25, 0],
                pathOffset: [0, 0, 0.75, 1],
              }}
              transition={{
                duration: 3,
                delay: i * 0.3,
                repeat: Infinity,
                ease: "linear",
                times: [0, 0.1, 0.9, 1],
              }}
              style={{ opacity: 0.8 }}
            />
            <motion.circle
              cx={last[0]}
              cy={last[1]}
              r={2.5}
              fill="var(--color-accent)"
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function GhostMascot() {
  return (
    <div className="relative inline-flex items-center justify-center mb-2" style={{ width: 300, height: 200 }}>
      <CircuitTrail />
      <motion.div
        className="relative z-10"
        style={{ marginRight: 20 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <Image
            src="/ghost.png"
            alt="OpenSoul ghost mascot"
            width={280}
            height={280}
            priority
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
