"use client";

/** Log wygranych Versus w trybie solo -- localStorage, spójne z resztą trybu
 * solo (decyzje zostają w przeglądarce, zero Firestore). Odpowiednik
 * localLiked.ts, ale przechowuje też znacznik czasu -- solo dziś nie ma
 * ŻADNEJ trwałej historii Versus (wynik żyje tylko w pamięci komponentu),
 * więc to jedyny sposób, żeby solo miało cokolwiek do policzenia w
 * Statystykach. Logika (dopisywanie wpisu) jest czystą funkcją operującą na
 * tablicy -- testowalna bez DOM; localStorage get/set to cienkie,
 * nietestowane wrappery (konwencja tego repo, zob. localLiked.ts). */

const KEY = "tumolec:solo:versusHistory";

export type VersusWin = { steamAppId: number; wonAt: number };

export function addVersusWin(current: VersusWin[], steamAppId: number): VersusWin[] {
  return [...current, { steamAppId, wonAt: Date.now() }];
}

export function getLocalVersusHistory(): VersusWin[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VersusWin[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalVersusHistory(entries: VersusWin[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}
