import { describe, expect, it } from "vitest";
import { daysUntil } from "./releaseCountdown";

describe("daysUntil", () => {
  it("parses a Polish-formatted future date and returns whole days", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    expect(daysUntil("17 lipca 2026", now)).toBe(3);
  });

  it("handles single-digit day and different month", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(daysUntil("5 marca 2026", now)).toBe(63);
  });

  it("returns 0 for a date that is today", () => {
    const now = new Date("2026-07-14T08:00:00Z");
    expect(daysUntil("14 lipca 2026", now)).toBe(0);
  });

  it("returns null for an unparseable string (imprecise date)", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    expect(daysUntil("2026", now)).toBeNull();
    expect(daysUntil("Q3 2026", now)).toBeNull();
    expect(daysUntil("Wkrótce", now)).toBeNull();
  });

  it("returns a negative number for a past date (already released)", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    expect(daysUntil("17 września 2020", now)).toBeLessThan(0);
  });
});
