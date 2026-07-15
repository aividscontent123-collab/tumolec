import { describe, expect, it } from "vitest";
import { parseSteamAppDetails } from "./steam";

describe("parseSteamAppDetails", () => {
  it("parses full data with movie, screenshots, release date and reviews", () => {
    const data = {
      name: "Hades",
      header_image: "https://example.com/header.jpg",
      short_description: "A rogue-like dungeon crawler.",
      genres: [{ description: "Akcja" }, { description: "RPG" }],
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
    expect(result.genres).toEqual(["Akcja", "RPG"]);
    expect(result.tags).toEqual(["Akcja", "RPG", "Single-player"]);
  });

  it("picks top reviews by votes_up, truncates long text, caps at 3", () => {
    const data = { name: "Hades", header_image: "", short_description: "", pc_requirements: {} };
    const longText = "a".repeat(300);
    const reviews = {
      query_summary: { review_score_desc: "", total_positive: 0, total_reviews: 0 },
      reviews: [
        { review: "low votes", voted_up: true, votes_up: 1, author: { personaname: "Low" } },
        { review: longText, voted_up: true, votes_up: 50, author: { personaname: "Top" } },
        { review: "mid votes", voted_up: false, votes_up: 10, author: { personaname: "Mid" } },
        { review: "fourth", voted_up: true, votes_up: 5, author: { personaname: "Fourth" } },
      ],
    };

    const result = parseSteamAppDetails(1145360, data, reviews);

    expect(result.topReviews).toHaveLength(3);
    expect(result.topReviews[0]).toEqual({ author: "Top", text: "a".repeat(280) + "…", votedUp: true });
    expect(result.topReviews[1]).toEqual({ author: "Mid", text: "mid votes", votedUp: false });
    expect(result.topReviews[2].author).toBe("Fourth");
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

  it("deduplicates genres independently of tags, gdy Steam powtarza opis gatunku", () => {
    const data = {
      name: "Test Game",
      header_image: "",
      short_description: "",
      genres: [{ description: "RPG" }, { description: "RPG" }],
      pc_requirements: {},
    };
    const reviews = { query_summary: { review_score_desc: "", total_positive: 0, total_reviews: 0 } };

    const result = parseSteamAppDetails(1, data, reviews);

    expect(result.genres).toEqual(["RPG"]);
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
