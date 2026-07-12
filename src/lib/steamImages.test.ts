import { describe, expect, it } from "vitest";
import { steamLibraryPortraitUrl } from "./steamImages";

describe("steamLibraryPortraitUrl", () => {
  // Blokuje regres formatu ścieżki CDN: zły URL = 404 na każdym obrazku =
  // cicha degradacja do fallbacku, "nic się nie zmienia". Ten asert to łapie.
  it("builds the portrait library asset URL for the appid", () => {
    expect(steamLibraryPortraitUrl(570)).toBe(
      "https://cdn.akamai.steamstatic.com/steam/apps/570/library_600x900_2x.jpg",
    );
  });
});
