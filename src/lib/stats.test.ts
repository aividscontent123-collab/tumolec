import { describe, expect, it } from "vitest";
import { computeStats, type WinEvent } from "./stats";
import type { SteamCacheEntry } from "./steam";

function cacheEntry(overrides: Partial<SteamCacheEntry>): SteamCacheEntry {
  return {
    name: "Test Game",
    headerImageUrl: "",
    steamUrl: "",
    shortDescription: "",
    reviewSummary: "",
    reviewScorePercent: 0,
    tags: [],
    genres: [],
    minRequirements: "",
    recRequirements: "",
    cachedAt: 0,
    developers: [],
    releaseDate: null,
    screenshots: [],
    trailerHlsUrl: null,
    trailerThumbnail: null,
    totalReviews: 0,
    topReviews: [],
    ...overrides,
  };
}

describe("computeStats", () => {
  it("returns zeroed stats for empty input", () => {
    expect(computeStats([], {}, [])).toEqual({
      totalWins: 0,
      topGames: [],
      topGenres: [],
      totalHltbHours: 0,
      activity: { last7days: 0, last30days: 0, mostActiveWeekday: null },
    });
  });

  it("counts total wins and ranks top games, breaking ties by steamAppId", () => {
    const wins: WinEvent[] = [
      { steamAppId: 20, wonAt: null },
      { steamAppId: 10, wonAt: null },
      { steamAppId: 20, wonAt: null },
      { steamAppId: 10, wonAt: null },
      { steamAppId: 30, wonAt: null },
    ];
    const stats = computeStats(wins, {}, []);
    expect(stats.totalWins).toBe(5);
    expect(stats.topGames).toEqual([
      { steamAppId: 10, wins: 2 },
      { steamAppId: 20, wins: 2 },
      { steamAppId: 30, wins: 1 },
    ]);
  });

  it("limits topGames to the top 5", () => {
    const wins: WinEvent[] = Array.from({ length: 7 }, (_, i) => ({ steamAppId: i + 1, wonAt: null }));
    const stats = computeStats(wins, {}, []);
    expect(stats.topGames).toHaveLength(5);
  });

  it("ranks genres from both wins and liked games, deduping by appid", () => {
    const wins: WinEvent[] = [{ steamAppId: 1, wonAt: null }];
    const cacheByAppId = {
      1: cacheEntry({ tags: ["RPG", "Indie"] }),
      2: cacheEntry({ tags: ["RPG"] }),
    };
    const stats = computeStats(wins, cacheByAppId, [2]);
    expect(stats.topGenres).toEqual([
      { tag: "RPG", count: 2 },
      { tag: "Indie", count: 1 },
    ]);
  });

  it("breaks genre ties alphabetically", () => {
    const wins: WinEvent[] = [{ steamAppId: 1, wonAt: null }];
    const cacheByAppId = { 1: cacheEntry({ tags: ["Zeta", "Alfa"] }) };
    const stats = computeStats(wins, cacheByAppId, []);
    expect(stats.topGenres).toEqual([
      { tag: "Alfa", count: 1 },
      { tag: "Zeta", count: 1 },
    ]);
  });

  it("sums HLTB hours once per unique winning game, not once per win", () => {
    const wins: WinEvent[] = [
      { steamAppId: 1, wonAt: null },
      { steamAppId: 1, wonAt: null },
      { steamAppId: 2, wonAt: null },
    ];
    const cacheByAppId = {
      1: cacheEntry({ hltbMainStory: 10 }),
      2: cacheEntry({ hltbMainStory: 5 }),
    };
    expect(computeStats(wins, cacheByAppId, []).totalHltbHours).toBe(15);
  });

  it("treats a missing hltbMainStory as zero hours", () => {
    const wins: WinEvent[] = [{ steamAppId: 1, wonAt: null }];
    const cacheByAppId = { 1: cacheEntry({}) };
    expect(computeStats(wins, cacheByAppId, []).totalHltbHours).toBe(0);
  });

  it("counts activity within 7 and 30 day windows, excluding wins without wonAt", () => {
    const now = Date.now();
    const wins: WinEvent[] = [
      { steamAppId: 1, wonAt: now - 1 * 24 * 60 * 60 * 1000 },
      { steamAppId: 2, wonAt: now - 20 * 24 * 60 * 60 * 1000 },
      { steamAppId: 3, wonAt: now - 60 * 24 * 60 * 60 * 1000 },
      { steamAppId: 4, wonAt: null },
    ];
    const stats = computeStats(wins, {}, []);
    expect(stats.totalWins).toBe(4);
    expect(stats.activity.last7days).toBe(1);
    expect(stats.activity.last30days).toBe(2);
  });

  it("picks the weekday with the most wins as mostActiveWeekday", () => {
    const monday = new Date(2026, 6, 20, 12, 0, 0).getTime();
    const tuesday = new Date(2026, 6, 21, 12, 0, 0).getTime();
    const wins: WinEvent[] = [
      { steamAppId: 1, wonAt: monday },
      { steamAppId: 2, wonAt: monday },
      { steamAppId: 3, wonAt: tuesday },
    ];
    expect(computeStats(wins, {}, []).activity.mostActiveWeekday).toBe("poniedziałek");
  });

  it("returns null mostActiveWeekday when no wins have a timestamp", () => {
    const wins: WinEvent[] = [{ steamAppId: 1, wonAt: null }];
    expect(computeStats(wins, {}, []).activity.mostActiveWeekday).toBeNull();
  });
});
