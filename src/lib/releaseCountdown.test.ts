import { describe, expect, it } from "vitest";
import { daysUntil, isRecentRelease, isUpcomingSoon } from "./releaseCountdown";

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

const NOW = new Date(Date.UTC(2026, 6, 17)); // 2026-07-17

describe("isRecentRelease", () => {
  it("returns false for null releaseDate", () => {
    expect(isRecentRelease(null, NOW)).toBe(false);
  });

  it("returns false for a game that hasn't released yet (comingSoon)", () => {
    expect(isRecentRelease({ comingSoon: true, date: "1 lipca 2026" }, NOW)).toBe(false);
  });

  it("returns true for a game released today", () => {
    expect(isRecentRelease({ comingSoon: false, date: "17 lipca 2026" }, NOW)).toBe(true);
  });

  it("returns true for a game released exactly 60 days ago (inclusive boundary)", () => {
    expect(isRecentRelease({ comingSoon: false, date: "18 maja 2026" }, NOW)).toBe(true);
  });

  it("returns false for a game released 61 days ago", () => {
    expect(isRecentRelease({ comingSoon: false, date: "17 maja 2026" }, NOW)).toBe(false);
  });

  it("returns false for an unparseable date", () => {
    expect(isRecentRelease({ comingSoon: false, date: "Q3 2026" }, NOW)).toBe(false);
  });
});

describe("isUpcomingSoon", () => {
  it("returns false for null releaseDate", () => {
    expect(isUpcomingSoon(null, NOW)).toBe(false);
  });

  it("returns false for an already-released game", () => {
    expect(isUpcomingSoon({ comingSoon: false, date: "17 lipca 2026" }, NOW)).toBe(false);
  });

  it("returns true for a game releasing today", () => {
    expect(isUpcomingSoon({ comingSoon: true, date: "17 lipca 2026" }, NOW)).toBe(true);
  });

  it("returns true for a game releasing in exactly 7 days (inclusive boundary)", () => {
    expect(isUpcomingSoon({ comingSoon: true, date: "24 lipca 2026" }, NOW)).toBe(true);
  });

  it("returns false for a game releasing in 8 days", () => {
    expect(isUpcomingSoon({ comingSoon: true, date: "25 lipca 2026" }, NOW)).toBe(false);
  });

  it("returns false for an unparseable date", () => {
    expect(isUpcomingSoon({ comingSoon: true, date: "Wkrótce" }, NOW)).toBe(false);
  });
});
