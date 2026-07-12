/** Historia zagranych gier: czysta funkcja, bez zależności od Firestore/UI
 * (analogicznie do lib/elimination.ts), żeby dało się ją testować niezależnie. */

import type { PoolGame, RoundDoc } from "@/lib/rooms";

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

/** Polska odmiana "gra/gry/gier" po liczebniku. "Nastki" (11-14, 111-114...)
 * są wyjątkiem od reguły ostatniej cyfry -- zawsze "gier", niezależnie od
 * tego na co kończy się cała liczba (11 -> gier, nie "grę"; 12-14 -> gier,
 * nie "gry"). */
export function pluralizeGry(n: number): string {
  const lastDigit = n % 10;
  const lastTwoDigits = n % 100;
  const isTeens = lastTwoDigits >= 11 && lastTwoDigits <= 14;
  if (isTeens) return "gier";
  if (lastDigit === 1) return "grę";
  if (lastDigit >= 2 && lastDigit <= 4) return "gry";
  return "gier";
}

export type RoundBreakdown = { roundNumber: number; gamesIn: number; survivorsCount: number };

/** Dla wygranej gry (jedyny ocalały finałowej rundy) zwraca przebieg CAŁEJ jej
 * sesji: numer rundy, ile gier weszło, ilu ocalało. Pusta lista, gdy gra nigdy
 * nie była jedynym ocalałym (wyeliminowana albo wybrana inną mini-grą niż swipe). */
export function sessionBreakdownForGame(rounds: RoundDoc[], steamAppId: number): RoundBreakdown[] {
  const finalRound = rounds.find(
    (r) => r.status === "finished" && r.survivors?.length === 1 && r.survivors[0] === steamAppId,
  );
  if (!finalRound) return [];
  return rounds
    .filter((r) => r.sessionId === finalRound.sessionId)
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((r) => ({
      roundNumber: r.roundNumber,
      gamesIn: r.poolAtStart.length,
      survivorsCount: r.survivors?.length ?? 0,
    }));
}
