import { describe, expect, it } from "vitest";
import { newGameIdsForPool } from "./packages";
import type { PoolGame } from "@/lib/rooms";

function game(partial: Partial<PoolGame> & Pick<PoolGame, "steamAppId" | "status">): PoolGame {
  return {
    title: `Game ${partial.steamAppId}`,
    tags: [],
    reviewScorePercent: 0,
    reviewSummary: "",
    shortDescription: "",
    developers: [],
    releaseDate: null,
    screenshots: [],
    trailerHlsUrl: null,
    trailerThumbnail: null,
    totalReviews: 0,
    addedBy: "p1",
    playedAt: null,
    ...partial,
  };
}

describe("newGameIdsForPool", () => {
  it("returns every package id when the pool is empty", () => {
    expect(newGameIdsForPool([1, 2, 3], [])).toEqual([1, 2, 3]);
  });

  it("skips ids already present in the pool regardless of their status", () => {
    // Gra 1 jest 'played', gra 2 'active' -- obie liczą się jako obecne, więc
    // z paczki [1,2,3] nowa jest tylko 3 (nie nadpisujemy stanu played/active).
    const pool = [
      game({ steamAppId: 1, status: "played" }),
      game({ steamAppId: 2, status: "active" }),
    ];
    expect(newGameIdsForPool([1, 2, 3], pool)).toEqual([3]);
  });

  it("returns empty when all package ids are already in the pool", () => {
    const pool = [game({ steamAppId: 1, status: "removed" }), game({ steamAppId: 2, status: "active" })];
    expect(newGameIdsForPool([1, 2], pool)).toEqual([]);
  });

  it("preserves package order for the new ids", () => {
    const pool = [game({ steamAppId: 5, status: "active" })];
    expect(newGameIdsForPool([9, 5, 7], pool)).toEqual([9, 7]);
  });
});
