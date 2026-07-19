"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { SwipeGame } from "@/lib/types";

const CONFETTI = [
  { left: "10%", color: "var(--accent-brand)", delay: 0 },
  { left: "26%", color: "var(--rating)", delay: 0.1 },
  { left: "42%", color: "var(--pass)", delay: 0.2 },
  { left: "58%", color: "var(--accent-brand)", delay: 0.05 },
  { left: "74%", color: "var(--rating)", delay: 0.25 },
  { left: "90%", color: "var(--pass)", delay: 0.15 },
];

/** Ekran wyniku -- duży, satysfakcjonujący moment (brief: konfetti/skala,
 * referencja Duolingo). Konfetti to kilka animowanych kropek, nie biblioteka --
 * za mało tu potrzeba, żeby uzasadnić nową zależność. */
export function WinnerScreen({ game, onReroll }: { game: SwipeGame | undefined; onReroll?: () => void }) {
  if (!game) {
    return <p className="text-text-secondary p-6 text-center text-sm">Ładowanie wyniku…</p>;
  }

  return (
    <main className="relative flex h-dvh flex-col items-center justify-center gap-6 overflow-hidden px-[22px] text-center">
      {CONFETTI.map((c, i) => (
        <motion.span
          key={i}
          className="absolute top-0 h-2.5 w-2.5 rounded-full"
          style={{ left: c.left, backgroundColor: c.color }}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: "110dvh", opacity: [0, 1, 1, 0], rotate: 360 }}
          transition={{ duration: 1.8, delay: c.delay, ease: "easeIn" }}
        />
      ))}

      <motion.p
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-text-secondary text-xs tracking-widest"
      >
        GRAMY W
      </motion.p>

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
        className="relative aspect-video w-full max-w-sm overflow-hidden rounded-2xl shadow-[0_0_60px_10px_var(--accent-brand-soft)]"
      >
        {game.coverImageUrl && (
          <Image src={game.coverImageUrl} alt={game.title} fill className="object-cover" />
        )}
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="font-heading text-[30px] font-bold text-foreground"
      >
        {game.title}
      </motion.h1>

      <motion.a
        href={`https://store.steampowered.com/app/${game.steamAppId}`}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="bg-accent-brand rounded-full px-8 py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
      >
        Zobacz na Steam
      </motion.a>

      {onReroll && (
        <motion.button
          type="button"
          onClick={onReroll}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-secondary rounded-full px-8 py-3 text-sm font-bold text-foreground"
        >
          Przelosuj
        </motion.button>
      )}
    </main>
  );
}
