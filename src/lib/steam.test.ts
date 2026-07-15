import { describe, expect, it } from "vitest";
import { parseSteamAppDetails } from "./steam";

describe("parseSteamAppDetails", () => {
  it("parses full data with movie, screenshots, release date and reviews", () => {
    const data = {
      name: "Hades",
      header_image: "https://example.com/header.jpg",
      short_description: "A rogue-like dungeon crawler.",
      genres: [{ description: "Action" }],
      categories: [{ description: "Single-player" }],
      pc_requirements: { minimum: "min", recommended: "rec" },
      developers: ["Supergiant Games"],
      release_date: { coming_soon: false, date: "17 września 2020" },
      screenshots: [
        { id: 0, path_thumbnail: "https://example.com/thumb0.jpg", path_full: "https://example.com/full0.jpg" },
        { id: 1, path_thumbnail: "https://example.com/thumb1.jpg", path_full: "https://example.com/full1.jpg" },
      ],
      movies: [
        {
          id: 1,
          name: "Trailer",
          thumbnail: "https://example.com/movie-thumb.jpg",
          hls_h264: "https://example.com/trailer.m3u8",
          highlight: true,
        },
      ],
    };
    const reviews = { query_summary: { review_score_desc: "Bardzo pozytywne", total_positive: 90, total_reviews: 100 } };

    const result = parseSteamAppDetails(1145360, data, reviews);

    expect(result.name).toBe("Hades");
    expect(result.developers).toEqual(["Supergiant Games"]);
    expect(result.releaseDate).toEqual({ comingSoon: false, date: "17 września 2020" });
    expect(result.screenshots).toEqual(["https://example.com/full0.jpg", "https://example.com/full1.jpg"]);
    expect(result.trailerHlsUrl).toBe("https://example.com/trailer.m3u8");
    expect(result.trailerThumbnail).toBe("https://example.com/movie-thumb.jpg");
    expect(result.totalReviews).toBe(100);
    expect(result.reviewScorePercent).toBe(90);
    expect(result.tags).toEqual(["Action", "Single-player"]);
  });

  it("deduplicates tags when Steam repeats a genre/category description", () => {
    const data = {
      name: "Portal 2",
      header_image: "https://example.com/header.jpg",
      short_description: "",
      genres: [{ description: "Action" }],
      categories: [{ description: "Warsztat Steam" }, { description: "Warsztat Steam" }],
      pc_requirements: {},
    };
    const reviews = { query_summary: { review_score_desc: "", total_positive: 0, total_reviews: 0 } };

    const result = parseSteamAppDetails(620, data, reviews);

    expect(result.tags).toEqual(["Action", "Warsztat Steam"]);
  });

  it("handles missing release_date, movies, screenshots, developers gracefully", () => {
    const data = {
      name: "Old Game",
      header_image: "https://example.com/header.jpg",
      short_description: "",
      pc_requirements: [],
    };
    const reviews = {};

    const result = parseSteamAppDetails(42, data, reviews);

    expect(result.developers).toEqual([]);
    expect(result.releaseDate).toBeNull();
    expect(result.screenshots).toEqual([]);
    expect(result.trailerHlsUrl).toBeNull();
    expect(result.trailerThumbnail).toBeNull();
    expect(result.totalReviews).toBe(0);
    expect(result.reviewScorePercent).toBe(0);
    expect(result.reviewSummary).toBe("Brak ocen");
  });
});
