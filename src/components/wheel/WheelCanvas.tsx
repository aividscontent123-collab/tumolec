"use client";

import { motion } from "framer-motion";
import type { WheelState } from "@/lib/rooms";

const SEGMENT_COLORS = ["#8b5cf6", "#2fb3a0", "#c2703d", "#e05e8f", "#4f7cff", "#f2b705"];
const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 4;
const SPIN_DURATION = 4.2;

function polarToCartesian(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function wedgePath(startAngle: number, endAngle: number) {
  const start = polarToCartesian(endAngle, RADIUS);
  const end = polarToCartesian(startAngle, RADIUS);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

/** SVG koło ze segmentami równymi liczbie wpisów. Kąt docelowy liczony
 * identycznie na każdym kliencie z tych samych danych z Firestore (indeks
 * zwycięzcy w `entries` + `extraTurns`) -- nikt nie losuje kąta lokalnie,
 * więc animacja jest zsynchronizowana między wszystkimi ekranami pokoju. */
export function WheelCanvas({
  wheel,
  onSpinAnimationComplete,
}: {
  wheel: WheelState;
  onSpinAnimationComplete: () => void;
}) {
  const { entries, winner, extraTurns } = wheel;
  const segmentAngle = entries.length > 0 ? 360 / entries.length : 360;
  const winnerIndex = winner ? entries.indexOf(winner) : -1;

  // Jeśli ktoś usunął wpis zwycięzcy z puli już po wylosowaniu, indeks
  // zwycięzcy się nie znajdzie -- koło zostaje w pozycji wyjściowej zamiast
  // się przekręcić donikąd (rzadki edge case, celowo nieobsługiwany dalej).
  const targetRotation =
    winnerIndex >= 0 && extraTurns != null
      ? 360 * extraTurns - (segmentAngle * winnerIndex + segmentAngle / 2)
      : 0;

  return (
    <div
      className="relative mx-auto aspect-square w-full"
      style={{ maxWidth: "min(88vw, 380px)" }}
    >
      <div
        className="absolute left-1/2 -top-[6px] z-10 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderTop: "16px solid var(--accent-brand)",
        }}
      />
      <motion.svg
        key={winner ? `${winner}-${extraTurns}` : "idle"}
        width="100%"
        height="100%"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        initial={{ rotate: 0 }}
        animate={{ rotate: targetRotation }}
        transition={{ duration: SPIN_DURATION, ease: [0.1, 0.75, 0.2, 1] }}
        onAnimationComplete={() => {
          if (winner) onSpinAnimationComplete();
        }}
      >
        {entries.length === 0 ? (
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="oklch(0.24 0.02 265)" />
        ) : (
          entries.map((entry, i) => {
            const start = i * segmentAngle;
            const end = start + segmentAngle;
            const mid = start + segmentAngle / 2;
            const label = polarToCartesian(mid, RADIUS * 0.62);
            return (
              <g key={`${entry}-${i}`}>
                <path
                  d={wedgePath(start, end)}
                  fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
                  stroke="oklch(0.14 0.025 270)"
                  strokeWidth={2}
                />
                <text
                  x={label.x}
                  y={label.y}
                  fill="white"
                  fontSize={11}
                  fontWeight={600}
                  textAnchor="middle"
                  transform={`rotate(${mid}, ${label.x}, ${label.y})`}
                >
                  {entry.length > 14 ? `${entry.slice(0, 13)}…` : entry}
                </text>
              </g>
            );
          })
        )}
      </motion.svg>
    </div>
  );
}
