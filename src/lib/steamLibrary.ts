/** Filtrowanie i porządkowanie biblioteki Steam użytkownika (tryb solo).
 * Dane wejściowe pochodzą z `IPlayerService/GetOwnedGames` (appid+playtime,
 * bez okładek/tagów -- te dociągają się leniwie osobno, patrz SoloSwipeScreen). */

export type SteamOwnedGame = {
  steamAppId: number;
  name: string;
  playtimeMinutes: number;
};

export type BacklogFilter = "never" | "under2h" | "under10h" | "abandoned";

export function filterByPlaytime(games: SteamOwnedGame[], filter: BacklogFilter): SteamOwnedGame[] {
  switch (filter) {
    case "never":
      return games.filter((g) => g.playtimeMinutes === 0);
    case "under2h":
      return games.filter((g) => g.playtimeMinutes < 120);
    case "under10h":
      return games.filter((g) => g.playtimeMinutes < 600);
    case "abandoned":
      return games.filter((g) => g.playtimeMinutes >= 120 && g.playtimeMinutes < 600);
  }
}

/** Fisher-Yates. Talia swipe'a nie ma sensu w kolejności alfabetycznej/appid --
 * losowa kolejność to punkt wyjścia, nie tylko kosmetyka. */
export function shuffleGames(games: SteamOwnedGame[]): SteamOwnedGame[] {
  const result = [...games];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
