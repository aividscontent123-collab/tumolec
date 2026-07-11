/** Historia zagranych gier: czysta funkcja, bez zależności od Firestore/UI
 * (analogicznie do lib/elimination.ts), żeby dało się ją testować niezależnie. */

import type { PoolGame } from "@/lib/rooms";

export type History = { totalPlayed: number; games: PoolGame[] };

/** Buduje historię z pełnej puli: tylko status "played", najnowsze pierwsze.
 * playedAt === null (serverTimestamp jeszcze nierozwiązany tuż po kliknięciu
 * "Zagrane") traktujemy jako najnowsze -> na górze. Remis rozstrzygamy po
 * steamAppId, żeby kolejność była deterministyczna. */
export function buildHistory(games: PoolGame[]): History {
  const played = games.filter((g) => g.status === "played");
  const sorted = [...played].sort((a, b) => {
    const at = a.playedAt ?? Infinity;
    const bt = b.playedAt ?? Infinity;
    if (at !== bt) return bt - at; // desc, newest first, nulls (Infinity) on top
    return a.steamAppId - b.steamAppId;
  });
  return { totalPlayed: sorted.length, games: sorted };
}
