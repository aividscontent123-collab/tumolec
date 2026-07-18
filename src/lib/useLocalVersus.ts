"use client";

import { useState } from "react";
import {
  breakTieDeterministically,
  pickTieBreakWinner,
  resolveRound,
  type Swipe,
  type SwipeDirection,
} from "@/lib/elimination";

const SOLO_PARTICIPANT = "solo";

// `triggeredAt`/`extraTurns` generowane RAZ w startTieBreak() i trzymane w stanie --
// nie fabrykować ich w komponencie przy każdym renderze (Date.now()/Math.random()
// inline w JSX dawałyby nową wartość co render i resetowały animację CoinFlip3D/WheelCanvas,
// które oczekują stabilnej wartości identyfikującej POJEDYNCZY trigger).
type LocalTieBreak = {
  method: "coin" | "wheel";
  resultAppId: number;
  triggeredAt: { toMillis: () => number };
  extraTurns: number;
};

/** Wersja lokalna orkiestracji rund eliminacji z SwipeScreen.tsx/RoundVoting --
 * ten sam resolveRound, bez Firestore, bez wielu uczestników (jeden głos na
 * grę na rundę). Wzorem useLocalCoinflip/useLocalWheel z Fazy A2b. */
export function useLocalVersus(initialPool: number[]) {
  const [pool, setPool] = useState(initialPool);
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const [winner, setWinner] = useState<number | null>(null);
  const [tieBreak, setTieBreak] = useState<LocalTieBreak | null>(null);

  function vote(steamAppId: number, direction: SwipeDirection) {
    const nextSwipes = [...swipes, { participantId: SOLO_PARTICIPANT, steamAppId, direction }];
    setSwipes(nextSwipes);

    const voted = new Set(nextSwipes.map((s) => s.steamAppId));
    if (!pool.every((id) => voted.has(id))) return;

    const result = resolveRound(pool, nextSwipes);
    if (result.status === "winner") {
      setWinner(result.steamAppId);
    } else if (result.status === "advance") {
      setPool(result.survivors);
      setSwipes([]);
    } else if (result.status === "tie-break") {
      const brokenTie = breakTieDeterministically(result.tiedForCutoff, result.slotsAvailable);
      setPool([...result.survivors, ...brokenTie]);
      setSwipes([]);
    }
  }

  // Ręczna minigra (moneta/koło) -- wyłącznie gdy w puli zostały dokładnie 2 gry.
  // Solo = zgoda trywialna (1 uczestnik), więc brak etapu zbierania zgód jak w pokoju.
  function startTieBreak(method: "coin" | "wheel") {
    if (pool.length !== 2) return;
    setTieBreak({
      method,
      resultAppId: pickTieBreakWinner([pool[0], pool[1]]),
      triggeredAt: { toMillis: () => Date.now() },
      extraTurns: 4 + Math.floor(Math.random() * 3),
    });
  }

  function resolveTieBreak() {
    if (tieBreak) setWinner(tieBreak.resultAppId);
  }

  const myVotes = new Set(swipes.map((s) => s.steamAppId));
  const deck = pool.filter((id) => !myVotes.has(id));

  return { pool, deck, poolSize: pool.length, winner, vote, tieBreak, startTieBreak, resolveTieBreak };
}
