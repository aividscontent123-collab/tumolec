"use client";

import { useState } from "react";
import { resolveRound, breakTieDeterministically, type Swipe, type SwipeDirection } from "@/lib/elimination";

const SOLO_PARTICIPANT = "solo";

/** Wersja lokalna orkiestracji rund eliminacji z SwipeScreen.tsx/RoundVoting --
 * ten sam resolveRound, bez Firestore, bez wielu uczestników (jeden głos na
 * grę na rundę). Wzorem useLocalCoinflip/useLocalWheel z Fazy A2b. */
export function useLocalVersus(initialPool: number[]) {
  const [pool, setPool] = useState(initialPool);
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const [winner, setWinner] = useState<number | null>(null);

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

  const myVotes = new Set(swipes.map((s) => s.steamAppId));
  const deck = pool.filter((id) => !myVotes.has(id));

  return { deck, poolSize: pool.length, winner, vote };
}
