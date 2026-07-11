import { describe, expect, it } from "vitest";
import { decideSwipeDirection, SWIPE_DISTANCE_THRESHOLD, SWIPE_VELOCITY_THRESHOLD } from "./swipeGesture";

describe("decideSwipeDirection", () => {
  it("returns null below both thresholds", () => {
    expect(decideSwipeDirection(20, 0.1)).toBeNull();
  });

  it("flings right past the distance threshold", () => {
    expect(decideSwipeDirection(SWIPE_DISTANCE_THRESHOLD + 1, 0)).toBe("right");
  });

  it("flings left past the distance threshold", () => {
    expect(decideSwipeDirection(-(SWIPE_DISTANCE_THRESHOLD + 1), 0)).toBe("left");
  });

  it("flings right on a fast short flick even under the distance threshold", () => {
    expect(decideSwipeDirection(30, SWIPE_VELOCITY_THRESHOLD + 0.1)).toBe("right");
  });

  it("flings left on a fast short flick to the left", () => {
    expect(decideSwipeDirection(-30, SWIPE_VELOCITY_THRESHOLD + 0.1)).toBe("left");
  });
});
