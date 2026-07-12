/** Paczki gier: czysta funkcja diff-u paczki względem puli pokoju, bez
 * zależności od Firestore/UI (analogicznie do lib/elimination.ts). */

import type { PoolGame } from "@/lib/rooms";

/** Które gry z paczki są NOWE względem obecnej puli. Identyfikacja po steamAppId,
 * niezależnie od statusu gry w puli -- gra już obecna (nawet 'played'/'removed')
 * jest pomijana, żeby dodanie paczki nie przywróciło jej z powrotem na 'active'. */
export function newGameIdsForPool(packageGameIds: number[], poolGames: PoolGame[]): number[] {
  const present = new Set(poolGames.map((g) => g.steamAppId));
  return packageGameIds.filter((id) => !present.has(id));
}
