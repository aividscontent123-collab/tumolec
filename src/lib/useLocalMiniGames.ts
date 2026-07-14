"use client";

import { useState } from "react";
import type { CoinflipState, WheelState } from "@/lib/rooms";

const FLIP_DURATION_MS = 2200;

/** Wersja lokalna triggerCoinflip (rooms.ts) -- ten sam algorytm losowania,
 * bez zapisu do Firestore. Jeden uczestnik (tryb solo) nie potrzebuje
 * synchronizacji między klientami. */
export function useLocalCoinflip() {
  const [coinflip, setCoinflip] = useState<CoinflipState>({
    result: null,
    spinning: false,
    triggeredAt: null,
  });

  function flip() {
    const result: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
    setCoinflip({ result, spinning: true, triggeredAt: { toMillis: () => Date.now() } });
    setTimeout(() => setCoinflip((s) => ({ ...s, spinning: false })), FLIP_DURATION_MS);
  }

  return { coinflip, flip };
}

/** Wersja lokalna addWheelEntry/removeWheelEntry/triggerWheelSpin (rooms.ts). */
export function useLocalWheel() {
  const [wheel, setWheel] = useState<WheelState>({
    entries: [],
    spinning: false,
    winner: null,
    extraTurns: null,
  });

  function addEntry(entry: string) {
    if (!entry || wheel.entries.includes(entry)) return;
    setWheel((w) => ({ ...w, entries: [...w.entries, entry] }));
  }

  function removeEntry(entry: string) {
    setWheel((w) => ({ ...w, entries: w.entries.filter((e) => e !== entry) }));
  }

  function spin() {
    if (wheel.entries.length === 0) return;
    const winner = wheel.entries[Math.floor(Math.random() * wheel.entries.length)];
    const extraTurns = 4 + Math.floor(Math.random() * 3);
    setWheel((w) => ({ ...w, winner, extraTurns, spinning: true }));
  }

  function finishSpin() {
    setWheel((w) => ({ ...w, spinning: false }));
  }

  return { wheel, addEntry, removeEntry, spin, finishSpin };
}
