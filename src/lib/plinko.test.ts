import { describe, expect, it } from "vitest";
import { slotProbabilities } from "./plinko";

describe("slotProbabilities", () => {
  it("n=2 -> równe 50/50 (1 rząd kołków)", () => {
    expect(slotProbabilities(2)).toEqual([0.5, 0.5]);
  });

  it("n=3 -> [0.25, 0.5, 0.25] (2 rzędy)", () => {
    expect(slotProbabilities(3)).toEqual([0.25, 0.5, 0.25]);
  });

  it("n=4 -> [0.125, 0.375, 0.375, 0.125] (3 rzędy)", () => {
    expect(slotProbabilities(4)).toEqual([0.125, 0.375, 0.375, 0.125]);
  });

  it("n=5 -> [0.0625, 0.25, 0.375, 0.25, 0.0625] (4 rzędy)", () => {
    expect(slotProbabilities(5)).toEqual([0.0625, 0.25, 0.375, 0.25, 0.0625]);
  });

  it("prawdopodobieństwa sumują się do 1", () => {
    for (const n of [2, 3, 5, 8]) {
      const sum = slotProbabilities(n).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("rozkład jest symetryczny (brzegi równe, środek najwyższy)", () => {
    const p = slotProbabilities(5);
    expect(p[0]).toBeCloseTo(p[4], 10);
    expect(p[1]).toBeCloseTo(p[3], 10);
    expect(p[2]).toBeGreaterThan(p[1]);
  });
});
