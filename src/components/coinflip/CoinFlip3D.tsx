"use client";

import { motion, useAnimation } from "framer-motion";
import { useEffect, useRef } from "react";
import type { CoinflipState } from "@/lib/rooms";

const FLIP_DURATION_S = 2.2;
const FULL_SPINS = 5;

/** Pseudo-3D obrót monety (rotateY + perspective, bez nowych zależności).
 * `triggeredAt` (serverTimestamp z Firestore) identyfikuje KTÓRY rzut jest
 * aktualnie animowany -- każdy klient odpala animację lokalnie w momencie
 * odebrania update'u, więc uczestnicy widzą ją niemal jednocześnie (nie
 * idealnie zsynchronizowanie klatka-po-klatce, wystarczające dla 2-4 graczy). */
export function CoinFlip3D({ coinflip }: { coinflip: CoinflipState | null }) {
  const controls = useAnimation();
  const lastTriggerMs = useRef<number | null>(null);

  useEffect(() => {
    if (!coinflip?.spinning || !coinflip.result || !coinflip.triggeredAt) return;
    const triggerMs = coinflip.triggeredAt.toMillis();
    if (lastTriggerMs.current === triggerMs) return;
    lastTriggerMs.current = triggerMs;

    const finalRotation = FULL_SPINS * 360 + (coinflip.result === "tails" ? 180 : 0);
    controls.set({ rotateY: 0 });
    controls.start({
      rotateY: finalRotation,
      transition: { duration: FLIP_DURATION_S, ease: [0.16, 1, 0.3, 1] },
    });
  }, [coinflip, controls]);

  return (
    <div style={{ perspective: 900 }}>
      <motion.div
        animate={controls}
        style={{ transformStyle: "preserve-3d" }}
        className="relative h-40 w-40"
      >
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full text-lg font-bold text-white"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: "var(--accent-brand)",
            boxShadow: "0 8px 24px var(--accent-brand-soft)",
          }}
        >
          Orzeł
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full text-lg font-bold text-white"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            backgroundColor: "oklch(0.3 0.02 265)",
          }}
        >
          Reszka
        </div>
      </motion.div>
    </div>
  );
}
