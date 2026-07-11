import { describe, expect, it } from "vitest";
import { buildHistory, pluralizeGry } from "./history";
import type { PoolGame } from "@/lib/rooms";

/** Minimalne fixture -- buildHistory czyta tylko status/playedAt/steamAppId,
 * resztę pól SwipeGame wypełniamy zaślepkami. */
function game(partial: Partial<PoolGame> & Pick<PoolGame, "steamAppId" | "status">): PoolGame {
  return {
    title: `Game ${partial.steamAppId}`,
    tags: [],
    reviewScorePercent: 0,
    reviewSummary: "",
    addedBy: "p1",
    playedAt: null,
    ...partial,
  };
}

describe("buildHistory", () => {
  it("returns empty history for an empty pool", () => {
    expect(buildHistory([])).toEqual({ totalPlayed: 0, games: [] });
  });

  it("counts only played games, ignoring active and removed", () => {
    const games = [
      game({ steamAppId: 1, status: "active", playedAt: null }),
      game({ steamAppId: 2, status: "played", playedAt: 100 }),
      game({ steamAppId: 3, status: "removed", playedAt: null }),
    ];
    const result = buildHistory(games);
    expect(result.totalPlayed).toBe(1);
    expect(result.games.map((g) => g.steamAppId)).toEqual([2]);
  });

  it("orders played games by playedAt descending (newest first)", () => {
    const games = [
      game({ steamAppId: 1, status: "played", playedAt: 100 }),
      game({ steamAppId: 2, status: "played", playedAt: 300 }),
      game({ steamAppId: 3, status: "played", playedAt: 200 }),
    ];
    expect(buildHistory(games).games.map((g) => g.steamAppId)).toEqual([2, 3, 1]);
  });

  it("sorts null playedAt to the top, breaking ties by steamAppId", () => {
    // Dwa świeżo oznaczone (playedAt null -> na górze, tiebreak po steamAppId),
    // potem gra z rozwiązanym timestampem.
    const games = [
      game({ steamAppId: 50, status: "played", playedAt: null }),
      game({ steamAppId: 10, status: "played", playedAt: null }),
      game({ steamAppId: 99, status: "played", playedAt: 500 }),
    ];
    expect(buildHistory(games).games.map((g) => g.steamAppId)).toEqual([10, 50, 99]);
  });
});

describe("pluralizeGry", () => {
  it.each([
    [1, "grę"],
    [2, "gry"],
    [4, "gry"],
    [5, "gier"],
    [11, "gier"],
    [12, "gier"],
    [14, "gier"],
    [21, "grę"],
    [22, "gry"],
    [24, "gry"],
    [25, "gier"],
    [111, "gier"],
    [112, "gier"],
    [122, "gry"],
    [121, "grę"],
  ])("pluralizeGry(%i) === %s", (n, expected) => {
    expect(pluralizeGry(n)).toBe(expected);
  });
});
