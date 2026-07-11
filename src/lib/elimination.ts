/** Swipe + eliminacja rundowa: work/active/Tumolec.md w vaulcie Obsidian
 * (sekcja "Mechanika wyboru gry"). Czysta funkcja, bez zależności od
 * Firestore/UI, żeby dało się ją testować niezależnie. */

export type SwipeDirection = "left" | "right";

export type Swipe = {
  participantId: string;
  steamAppId: number;
  direction: SwipeDirection;
};

export type RoundResult =
  | { status: "empty" }
  | { status: "winner"; steamAppId: number }
  | { status: "advance"; survivors: number[] }
  | {
      status: "tie-break";
      survivors: number[];
      tiedForCutoff: number[];
      slotsAvailable: number;
    };

function rightSwipeRatio(steamAppId: number, swipes: Swipe[]): number {
  const votes = swipes.filter((s) => s.steamAppId === steamAppId);
  if (votes.length === 0) return 0;
  const right = votes.filter((s) => s.direction === "right").length;
  return right / votes.length;
}

/** Rozstrzyga jedną rundę eliminacji: odcina najsłabszą połowę puli (zaokrąglając
 * liczbę ocalałych w górę), albo zwraca zwycięzcę jeśli w puli była tylko 1 gra.
 * Remis dokładnie na granicy odcięcia jest zgłaszany jako `tie-break` zamiast
 * rozstrzygany po cichu — UI decyduje jak dobić brakujące miejsca (rzut monetą). */
export function resolveRound(pool: number[], swipes: Swipe[]): RoundResult {
  if (pool.length === 0) return { status: "empty" };
  if (pool.length === 1) return { status: "winner", steamAppId: pool[0] };

  const ranked = pool
    .map((steamAppId) => ({ steamAppId, ratio: rightSwipeRatio(steamAppId, swipes) }))
    .sort((a, b) => b.ratio - a.ratio);

  const survivorsCount = Math.ceil(pool.length / 2);
  const threshold = ranked[survivorsCount - 1].ratio;

  const clearSurvivors = ranked.filter((g) => g.ratio > threshold).map((g) => g.steamAppId);
  const tiedAtBoundary = ranked.filter((g) => g.ratio === threshold).map((g) => g.steamAppId);
  const slotsNeededFromTie = survivorsCount - clearSurvivors.length;

  if (slotsNeededFromTie >= tiedAtBoundary.length) {
    // Cała grupa remisujących mieści się w dostępnych miejscach -- brak niejednoznaczności.
    return { status: "advance", survivors: [...clearSurvivors, ...tiedAtBoundary] };
  }

  return {
    status: "tie-break",
    survivors: clearSurvivors,
    tiedForCutoff: tiedAtBoundary,
    slotsAvailable: slotsNeededFromTie,
  };
}
