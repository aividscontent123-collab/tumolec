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

export type MultiplayerFilter = "all" | "solo" | "multi";

// UWAGA: te stringi zależą od /api/steam/details pobierającego dane z l=polish
// (src/lib/steam.ts) -- zmiana tego parametru gdziekolwiek indziej cicho zepsuje
// to dopasowanie (żaden błąd kompilacji, po prostu wszystko przestanie pasować).
export function matchesMultiplayerFilter(tags: string[], filter: MultiplayerFilter): boolean {
  if (filter === "all") return true;
  if (filter === "solo") return tags.includes("Jednoosobowa");
  return tags.includes("Wieloosobowa") || tags.includes("Kooperacja");
}

/** Część wspólna bibliotek Steam uczestników pokoju, liczona z co najmniej
 * dwóch niepustych list -- mniej niż dwie biblioteki = nic do przecięcia. */
export function computeSharedLibrary(participants: { steamLibraryAppIds?: number[] }[]): number[] {
  const libraries = participants
    .map((p) => p.steamLibraryAppIds)
    .filter((ids): ids is number[] => Array.isArray(ids) && ids.length > 0);
  if (libraries.length < 2) return [];
  const [first, ...rest] = libraries;
  return first.filter((appId) => rest.every((lib) => lib.includes(appId)));
}

/** Puste `selected` = brak filtra (wszystko przechodzi). W przeciwnym razie
 * gra musi mieć co najmniej jeden z wybranych gatunków. */
export function matchesGenreFilter(genres: string[], selected: string[]): boolean {
  if (selected.length === 0) return true;
  return genres.some((g) => selected.includes(g));
}

/** Czyste gatunki Steam (l=polish) zweryfikowane doświadczalnie podczas
 * brainstormingu -- jedno źródło prawdy dla chipsów filtra, używane przez
 * ustawienia solo i Explore w pokoju. */
export const GENRE_OPTIONS: { value: string; label: string }[] = [
  { value: "Akcja", label: "Akcja" },
  { value: "Przygodowe", label: "Przygodowe" },
  { value: "RPG", label: "RPG" },
  { value: "Strategie", label: "Strategie" },
  { value: "Symulacje", label: "Symulacje" },
  { value: "Niezależne", label: "Niezależne" },
  { value: "Rekreacyjne", label: "Rekreacyjne (Casual)" },
  { value: "Sportowe", label: "Sportowe" },
];
