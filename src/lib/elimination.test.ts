import { describe, expect, it } from "vitest";
import { breakTieDeterministically, resolveRound, type Swipe } from "./elimination";

function rightSwipes(steamAppId: number, participantIds: string[]): Swipe[] {
  return participantIds.map((participantId) => ({
    participantId,
    steamAppId,
    direction: "right" as const,
  }));
}

describe("resolveRound", () => {
  it("returns empty when the pool has no games", () => {
    expect(resolveRound([], [])).toEqual({ status: "empty" });
  });

  it("returns the winner immediately when only one game remains", () => {
    expect(resolveRound([42], [])).toEqual({ status: "winner", steamAppId: 42 });
  });

  it("advances the clear top half, cutting unambiguous losers", () => {
    // 4 games, p1+p2 both like A and B, dislike C and D.
    const swipes: Swipe[] = [
      ...rightSwipes(1, ["p1", "p2"]),
      ...rightSwipes(2, ["p1", "p2"]),
      { participantId: "p1", steamAppId: 3, direction: "left" },
      { participantId: "p2", steamAppId: 3, direction: "left" },
      { participantId: "p1", steamAppId: 4, direction: "left" },
      { participantId: "p2", steamAppId: 4, direction: "left" },
    ];
    const result = resolveRound([1, 2, 3, 4], swipes);
    expect(result.status).toBe("advance");
    if (result.status === "advance") {
      expect(result.survivors.sort()).toEqual([1, 2]);
    }
  });

  it("rounds survivor count up for an odd pool", () => {
    // 3 games, distinct ratios: 1 > 2 > 3. ceil(3/2) = 2 survivors.
    const swipes: Swipe[] = [
      ...rightSwipes(1, ["p1", "p2"]),
      ...rightSwipes(2, ["p1"]),
      { participantId: "p2", steamAppId: 2, direction: "left" },
      { participantId: "p1", steamAppId: 3, direction: "left" },
      { participantId: "p2", steamAppId: 3, direction: "left" },
    ];
    const result = resolveRound([1, 2, 3], swipes);
    expect(result.status).toBe("advance");
    if (result.status === "advance") {
      expect(result.survivors.sort()).toEqual([1, 2]);
    }
  });

  it("flags a tie-break when the cutoff boundary is ambiguous", () => {
    // 4 games, need 2 survivors. A is clear top (ratio 1). B, C, D tie at ratio 0.5 —
    // only 1 of them can take the remaining slot.
    const swipes: Swipe[] = [
      ...rightSwipes(1, ["p1", "p2"]),
      { participantId: "p1", steamAppId: 2, direction: "right" },
      { participantId: "p2", steamAppId: 2, direction: "left" },
      { participantId: "p1", steamAppId: 3, direction: "right" },
      { participantId: "p2", steamAppId: 3, direction: "left" },
      { participantId: "p1", steamAppId: 4, direction: "right" },
      { participantId: "p2", steamAppId: 4, direction: "left" },
    ];
    const result = resolveRound([1, 2, 3, 4], swipes);
    expect(result).toEqual({
      status: "tie-break",
      survivors: [1],
      tiedForCutoff: expect.arrayContaining([2, 3, 4]),
      slotsAvailable: 1,
    });
  });

  it("lets an exact-fit tied group all advance without ambiguity", () => {
    // 5 games, ceil(5/2) = 3 survivors needed. A is clear top (ratio 1). B and C tie
    // at ratio 0.5 -- exactly 2 remaining slots, no ambiguity. D and E are clear losers.
    const swipes: Swipe[] = [
      ...rightSwipes(1, ["p1", "p2"]),
      { participantId: "p1", steamAppId: 2, direction: "right" },
      { participantId: "p2", steamAppId: 2, direction: "left" },
      { participantId: "p1", steamAppId: 3, direction: "left" },
      { participantId: "p2", steamAppId: 3, direction: "right" },
      { participantId: "p1", steamAppId: 4, direction: "left" },
      { participantId: "p2", steamAppId: 4, direction: "left" },
      { participantId: "p1", steamAppId: 5, direction: "left" },
      { participantId: "p2", steamAppId: 5, direction: "left" },
    ];
    const result = resolveRound([1, 2, 3, 4, 5], swipes);
    expect(result.status).toBe("advance");
    if (result.status === "advance") {
      expect(result.survivors.sort()).toEqual([1, 2, 3]);
    }
  });

  it("treats a game with zero recorded votes as ratio 0 (cut first)", () => {
    const swipes: Swipe[] = [...rightSwipes(1, ["p1", "p2"])];
    // Game 2 has no swipes at all.
    const result = resolveRound([1, 2], swipes);
    expect(result.status).toBe("advance");
    if (result.status === "advance") {
      expect(result.survivors).toEqual([1]);
    }
  });
});

describe("breakTieDeterministically", () => {
  it("wybiera najnizsze appid do liczby dostepnych miejsc", () => {
    expect(breakTieDeterministically([30, 10, 20], 2)).toEqual([10, 20]);
  });

  it("zwraca pustą listę gdy brak dostępnych miejsc", () => {
    expect(breakTieDeterministically([10, 20], 0)).toEqual([]);
  });
});
