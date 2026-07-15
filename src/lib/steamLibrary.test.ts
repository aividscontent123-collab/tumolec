import { describe, expect, it } from "vitest";
import {
  computeSharedLibrary,
  filterByPlaytime,
  matchesGenreFilter,
  matchesMultiplayerFilter,
  shuffleGames,
  type SteamOwnedGame,
} from "./steamLibrary";

function game(steamAppId: number, playtimeMinutes: number): SteamOwnedGame {
  return { steamAppId, name: `Game ${steamAppId}`, playtimeMinutes };
}

describe("filterByPlaytime", () => {
  const games = [
    game(1, 0), // nigdy nie grane
    game(2, 119), // <2h
    game(3, 120), // dokładnie 2h -- brzeg "porzucone"
    game(4, 599), // <10h, wciąż "porzucone" (2-10h)
    game(5, 600), // dokładnie 10h -- brzeg, NIE "porzucone" ani "<10h"
    game(6, 1000), // dużo grane
  ];

  it("never: tylko playtime === 0", () => {
    expect(filterByPlaytime(games, "never").map((g) => g.steamAppId)).toEqual([1]);
  });

  it("under2h: playtime < 120", () => {
    expect(filterByPlaytime(games, "under2h").map((g) => g.steamAppId)).toEqual([1, 2]);
  });

  it("under10h: playtime < 600", () => {
    expect(filterByPlaytime(games, "under10h").map((g) => g.steamAppId)).toEqual([1, 2, 3, 4]);
  });

  it("abandoned: 120 <= playtime < 600 (2-10h)", () => {
    expect(filterByPlaytime(games, "abandoned").map((g) => g.steamAppId)).toEqual([3, 4]);
  });
});

describe("shuffleGames", () => {
  it("zwraca te same elementy w innej tablicy (nie mutuje wejścia)", () => {
    const games = [game(1, 0), game(2, 0), game(3, 0)];
    const shuffled = shuffleGames(games);
    expect(shuffled).not.toBe(games);
    expect(shuffled.map((g) => g.steamAppId).sort()).toEqual([1, 2, 3]);
    expect(games.map((g) => g.steamAppId)).toEqual([1, 2, 3]); // wejście nietknięte
  });
});

describe("matchesMultiplayerFilter", () => {
  it("matches everything for 'all'", () => {
    expect(matchesMultiplayerFilter([], "all")).toBe(true);
  });

  it("matches only single-player tag for 'solo'", () => {
    expect(matchesMultiplayerFilter(["Jednoosobowa"], "solo")).toBe(true);
    expect(matchesMultiplayerFilter(["Wieloosobowa"], "solo")).toBe(false);
  });

  it("matches multiplayer or co-op tags for 'multi'", () => {
    expect(matchesMultiplayerFilter(["Wieloosobowa"], "multi")).toBe(true);
    expect(matchesMultiplayerFilter(["Kooperacja"], "multi")).toBe(true);
    expect(matchesMultiplayerFilter(["Jednoosobowa"], "multi")).toBe(false);
  });
});

describe("computeSharedLibrary", () => {
  it("returns empty when fewer than 2 participants have a library", () => {
    expect(computeSharedLibrary([{ steamLibraryAppIds: [1, 2, 3] }, {}])).toEqual([]);
  });

  it("returns the intersection of all participants' libraries", () => {
    const result = computeSharedLibrary([
      { steamLibraryAppIds: [1, 2, 3, 4] },
      { steamLibraryAppIds: [2, 3, 4, 5] },
      { steamLibraryAppIds: [3, 4, 5, 6] },
    ]);
    expect(result.sort()).toEqual([3, 4]);
  });

  it("returns empty when libraries don't overlap", () => {
    expect(computeSharedLibrary([{ steamLibraryAppIds: [1, 2] }, { steamLibraryAppIds: [3, 4] }])).toEqual([]);
  });

  it("ignores participants without a library when computing overlap", () => {
    const result = computeSharedLibrary([
      { steamLibraryAppIds: [1, 2] },
      {},
      { steamLibraryAppIds: [1, 2] },
    ]);
    expect(result.sort()).toEqual([1, 2]);
  });
});

describe("matchesGenreFilter", () => {
  it("dopasowuje wszystko, gdy nic nie wybrano", () => {
    expect(matchesGenreFilter(["RPG"], [])).toBe(true);
    expect(matchesGenreFilter([], [])).toBe(true);
  });

  it("dopasowuje gdy gra ma choć jeden z wybranych gatunkow", () => {
    expect(matchesGenreFilter(["Akcja", "RPG"], ["RPG", "Strategie"])).toBe(true);
  });

  it("odrzuca gdy gra nie ma zadnego z wybranych gatunkow", () => {
    expect(matchesGenreFilter(["Sportowe"], ["RPG", "Strategie"])).toBe(false);
  });
});
