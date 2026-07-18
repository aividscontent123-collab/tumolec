import { describe, expect, it } from "vitest";
import { pickMainStoryHours } from "./hltb";
import type { HowLongToBeatEntry } from "howlongtobeat";

function entry(overrides: Partial<HowLongToBeatEntry>): HowLongToBeatEntry {
  return {
    id: "1",
    name: "Test Game",
    description: "",
    platforms: [],
    imageUrl: "",
    timeLabels: [],
    gameplayMain: 10,
    gameplayMainExtra: 15,
    gameplayCompletionist: 20,
    similarity: 1,
    searchTerm: "test",
    playableOn: [],
    ...overrides,
  } as HowLongToBeatEntry;
}

describe("pickMainStoryHours", () => {
  it("returns null for an empty result list", () => {
    expect(pickMainStoryHours([])).toBeNull();
  });

  it("returns the rounded gameplayMain of the single result", () => {
    expect(pickMainStoryHours([entry({ gameplayMain: 12.4 })])).toBe(12);
  });

  it("picks the entry with the highest similarity, not the first one", () => {
    const results = [
      entry({ name: "Hades II", gameplayMain: 25, similarity: 0.6 }),
      entry({ name: "Hades", gameplayMain: 22, similarity: 0.95 }),
    ];
    expect(pickMainStoryHours(results)).toBe(22);
  });

  it("returns null when the best match has no usable main-story time", () => {
    expect(pickMainStoryHours([entry({ gameplayMain: 0, similarity: 1 })])).toBeNull();
  });
});
