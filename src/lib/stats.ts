/** Statystyki wyprowadzone z ukończonych sesji Versus (nie z ręcznego statusu
 * "zagrane" w puli pokoju -- to osobna, niepowiązana akcja, zob. spec Fazy C
 * kawałek 2). Czysta funkcja, bez zależności od Firestore/DOM (wzorem
 * elimination.ts/history.ts) -- testowalna niezależnie. `wonAt: null` dla
 * wygranych sprzed dodania finishedAt (pokój) -- liczą się wszędzie poza
 * `activity`, która wymaga znacznika czasu. */

import type { SteamCacheEntry } from "@/lib/steam";

export type WinEvent = { steamAppId: number; wonAt: number | null };

export type Stats = {
  totalWins: number;
  topGames: { steamAppId: number; wins: number }[];
  topGenres: { tag: string; count: number }[];
  totalHltbHours: number;
  activity: {
    last7days: number;
    last30days: number;
    mostActiveWeekday: string | null;
  };
};

const TOP_GAMES_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
// Ręcznie wypisane nazwy zamiast Intl/toLocaleDateString -- ta sama decyzja co
// pluralizeGry w history.ts: dostępność pełnych danych ICU dla "pl-PL" na
// dowolnym Node runtime nie jest gwarantowana, tablica jest prostsza i pewna.
const WEEKDAY_NAMES = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

export function computeStats(
  wins: WinEvent[],
  cacheByAppId: Record<number, SteamCacheEntry | undefined>,
  likedAppIds: number[],
): Stats {
  const totalWins = wins.length;

  const winCounts = new Map<number, number>();
  for (const w of wins) {
    winCounts.set(w.steamAppId, (winCounts.get(w.steamAppId) ?? 0) + 1);
  }
  const topGames = [...winCounts.entries()]
    .map(([steamAppId, count]) => ({ steamAppId, wins: count }))
    .sort((a, b) => (b.wins !== a.wins ? b.wins - a.wins : a.steamAppId - b.steamAppId))
    .slice(0, TOP_GAMES_LIMIT);

  const genreAppIds = new Set<number>([...wins.map((w) => w.steamAppId), ...likedAppIds]);
  const genreCounts = new Map<string, number>();
  for (const appId of genreAppIds) {
    for (const tag of cacheByAppId[appId]?.tags ?? []) {
      genreCounts.set(tag, (genreCounts.get(tag) ?? 0) + 1);
    }
  }
  const topGenres = [...genreCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));

  const uniqueWinAppIds = new Set(wins.map((w) => w.steamAppId));
  let totalHltbHours = 0;
  for (const appId of uniqueWinAppIds) {
    totalHltbHours += cacheByAppId[appId]?.hltbMainStory ?? 0;
  }

  const timedWins = wins.filter((w): w is { steamAppId: number; wonAt: number } => w.wonAt !== null);
  const now = Date.now();
  const last7days = timedWins.filter((w) => now - w.wonAt <= 7 * DAY_MS).length;
  const last30days = timedWins.filter((w) => now - w.wonAt <= 30 * DAY_MS).length;

  let mostActiveWeekday: string | null = null;
  if (timedWins.length > 0) {
    const weekdayCounts = new Map<string, number>();
    for (const w of timedWins) {
      const name = WEEKDAY_NAMES[new Date(w.wonAt).getDay()];
      weekdayCounts.set(name, (weekdayCounts.get(name) ?? 0) + 1);
    }
    mostActiveWeekday = [...weekdayCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return {
    totalWins,
    topGames,
    topGenres,
    totalHltbHours,
    activity: { last7days, last30days, mostActiveWeekday },
  };
}
