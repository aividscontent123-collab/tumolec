import { describe, expect, it } from "vitest";
import { reviewScoreColorClass } from "./reviewScore";

describe("reviewScoreColorClass", () => {
  it("returns the negative color below 40%", () => {
    expect(reviewScoreColorClass(0)).toBe("text-pass");
    expect(reviewScoreColorClass(39)).toBe("text-pass");
  });

  it("returns the mid color for 40-69%", () => {
    expect(reviewScoreColorClass(40)).toBe("text-rating-mid");
    expect(reviewScoreColorClass(69)).toBe("text-rating-mid");
  });

  it("returns the positive color at 70% and above", () => {
    expect(reviewScoreColorClass(70)).toBe("text-rating");
    expect(reviewScoreColorClass(100)).toBe("text-rating");
  });
});
