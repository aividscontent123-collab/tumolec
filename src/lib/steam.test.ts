import { describe, expect, it } from "vitest";
import {
  parseSteamAppDetails,
  parseDiscoverAppIds,
  parseDiscoverResults,
  matchesTagOrCommunityFilter,
  computeRandomDiscoverStart,
  shuffleDiscoverResults,
  toSwipeGame,
} from "./steam";

describe("toSwipeGame", () => {
  it("falls back to safe defaults when the cache document is missing", () => {
    const game = toSwipeGame(1145360, undefined);
    expect(game).toEqual({
      steamAppId: 1145360,
      title: "…",
      coverImageUrl: undefined,
      tags: [],
      genres: [],
      reviewScorePercent: 0,
      reviewSummary: "",
      shortDescription: "",
      developers: [],
      releaseDate: null,
      screenshots: [],
      trailerHlsUrl: null,
      trailerThumbnail: null,
      totalReviews: 0,
      topReviews: [],
      hltbMainStory: null,
    });
  });

  it("maps a complete cache document through unchanged", () => {
    const game = toSwipeGame(1145360, {
      name: "Hades",
      headerImageUrl: "https://example.com/header.jpg",
      tags: ["Akcja"],
      genres: ["RPG"],
      reviewScorePercent: 98,
      reviewSummary: "Bardzo pozytywne",
      shortDescription: "Rogue-like.",
      developers: ["Supergiant Games"],
      releaseDate: { comingSoon: false, date: "2020" },
      screenshots: ["https://example.com/s1.jpg"],
      trailerHlsUrl: "https://example.com/trailer.m3u8",
      trailerThumbnail: "https://example.com/thumb.jpg",
      totalReviews: 3633,
      topReviews: [{ author: "A", text: "Great", votedUp: true }],
      hltbMainStory: 22,
    });
    expect(game.title).toBe("Hades");
    expect(game.tags).toEqual(["Akcja"]);
    expect(game.hltbMainStory).toBe(22);
  });

  it("falls back hltbMainStory to null when the field is absent (pre-HLTB cache entries)", () => {
    const game = toSwipeGame(1145360, { name: "Hades" });
    expect(game.hltbMainStory).toBeNull();
  });
});

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

  it("picks top reviews by votes_up and truncates long text", () => {
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

    expect(result.topReviews).toHaveLength(4);
    expect(result.topReviews[0]).toEqual({ author: "Top", text: "a".repeat(280) + "…", votedUp: true });
    expect(result.topReviews[1]).toEqual({ author: "Mid", text: "mid votes", votedUp: false });
    expect(result.topReviews[2].author).toBe("Fourth");
    expect(result.topReviews[3].author).toBe("Low");
  });

  it("caps top reviews at 10", () => {
    const data = { name: "Hades", header_image: "", short_description: "", pc_requirements: {} };
    const reviews = {
      query_summary: { review_score_desc: "", total_positive: 0, total_reviews: 0 },
      reviews: Array.from({ length: 12 }, (_, i) => ({
        review: `review ${i}`,
        voted_up: true,
        votes_up: 12 - i,
        author: { personaname: `Author${i}` },
      })),
    };

    const result = parseSteamAppDetails(1145360, data, reviews);

    expect(result.topReviews).toHaveLength(10);
    expect(result.topReviews[0].author).toBe("Author0");
    expect(result.topReviews[9].author).toBe("Author9");
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

describe("parseDiscoverAppIds", () => {
  it("extracts every data-ds-appid from a results_html fragment", () => {
    const html = `
      <a href="https://store.steampowered.com/app/730/CounterStrike_2/" data-ds-appid="730" data-ds-tagids="[1663,19]" class="search_result_row">
        <span class="title">Counter-Strike 2</span>
      </a>
      <a href="https://store.steampowered.com/app/1623730/Palworld/" data-ds-appid="1623730" data-ds-tagids="[1695]" class="search_result_row">
        <span class="title">Palworld</span>
      </a>
    `;

    expect(parseDiscoverAppIds(html)).toEqual([730, 1623730]);
  });

  it("returns an empty array for a fragment with no results", () => {
    expect(parseDiscoverAppIds("")).toEqual([]);
    expect(parseDiscoverAppIds("<div>Brak wyników</div>")).toEqual([]);
  });
});

describe("parseDiscoverResults", () => {
  it("extracts appId + tagIds for every result", () => {
    const html = `
      <a href="https://store.steampowered.com/app/730/CounterStrike_2/" data-ds-appid="730" data-ds-itemkey="App_730" data-ds-tagids="[1663,1774,3859]" data-ds-descids="[2,5]" class="search_result_row">
        <span class="title">Counter-Strike 2</span>
      </a>
      <a href="https://store.steampowered.com/app/1623730/Palworld/" data-ds-appid="1623730" data-ds-itemkey="App_1623730" data-ds-tagids="[1695,1662,916648]" data-ds-crtrids="[41648656]" class="search_result_row">
        <span class="title">Palworld</span>
      </a>
    `;

    expect(parseDiscoverResults(html)).toEqual([
      { appId: 730, tagIds: [1663, 1774, 3859] },
      { appId: 1623730, tagIds: [1695, 1662, 916648] },
    ]);
  });

  it("handles a result with no data-ds-tagids attribute (empty tagIds, not an error)", () => {
    const html = `
      <a href="https://store.steampowered.com/app/730/CounterStrike_2/" data-ds-appid="730" class="search_result_row">
        <span class="title">Counter-Strike 2</span>
      </a>
    `;

    expect(parseDiscoverResults(html)).toEqual([{ appId: 730, tagIds: [] }]);
  });

  it("handles an empty tagids array", () => {
    const html = `<a data-ds-appid="42" data-ds-tagids="[]"></a>`;
    expect(parseDiscoverResults(html)).toEqual([{ appId: 42, tagIds: [] }]);
  });

  it("returns an empty array for a fragment with no results", () => {
    expect(parseDiscoverResults("")).toEqual([]);
    expect(parseDiscoverResults("<div>Brak wyników</div>")).toEqual([]);
  });
});

describe("matchesTagOrCommunityFilter", () => {
  it("matches everything when nothing is selected", () => {
    expect(matchesTagOrCommunityFilter([], null, [])).toBe(true);
    expect(matchesTagOrCommunityFilter(["Akcja"], [1, 2], [])).toBe(true);
  });

  it("matches via game.tags (genres/categories) regardless of candidateTagIds", () => {
    expect(matchesTagOrCommunityFilter(["Akcja", "Kooperacja"], null, ["Kooperacja"])).toBe(true);
    expect(matchesTagOrCommunityFilter(["Akcja", "Kooperacja"], [], ["Kooperacja"])).toBe(true);
  });

  it("matches via candidateTagIds when the tag isn't in genres/categories but resolves to a known Steam tag id", () => {
    // Metroidvania (id 1628) is a community tag, never present in appdetails genres/categories.
    expect(matchesTagOrCommunityFilter(["Akcja"], [1628, 999], ["Metroidvania"])).toBe(true);
  });

  it("does not match via candidateTagIds when candidateTagIds is null (library/shared source, no discover data)", () => {
    expect(matchesTagOrCommunityFilter(["Akcja"], null, ["Metroidvania"])).toBe(false);
  });

  it("does not match when candidateTagIds is present but doesn't contain the resolved id", () => {
    expect(matchesTagOrCommunityFilter(["Akcja"], [1, 2, 3], ["Metroidvania"])).toBe(false);
  });

  it("does not match an unresolvable selected tag via candidateTagIds (e.g. a date sentinel slipping through)", () => {
    expect(matchesTagOrCommunityFilter([], [1, 2, 3], ["__not_a_real_tag__"])).toBe(false);
  });

  it("OR semantics across multiple selected tags, mixing both signals", () => {
    expect(matchesTagOrCommunityFilter(["Akcja"], [1628], ["Metroidvania", "RPG"])).toBe(true); // via community id
    expect(matchesTagOrCommunityFilter(["RPG"], [999], ["Metroidvania", "RPG"])).toBe(true); // via game.tags
    expect(matchesTagOrCommunityFilter(["Akcja"], [999], ["Metroidvania", "RPG"])).toBe(false); // neither
  });
});

describe("computeRandomDiscoverStart", () => {
  it("returns 0 when totalCount fits in one page", () => {
    expect(computeRandomDiscoverStart(0)).toBe(0);
    expect(computeRandomDiscoverStart(25)).toBe(0);
  });

  it("returns an offset within [0, totalCount - pageSize] aligned to pageSize", () => {
    for (let i = 0; i < 50; i++) {
      const start = computeRandomDiscoverStart(1000);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThanOrEqual(975); // 1000 - 25
      expect(start % 25).toBe(0);
    }
  });
});

describe("shuffleDiscoverResults", () => {
  it("returns the same elements in a new array without mutating the input", () => {
    const results = [
      { appId: 1, tagIds: [] },
      { appId: 2, tagIds: [] },
      { appId: 3, tagIds: [] },
    ];
    const shuffled = shuffleDiscoverResults(results);
    expect(shuffled).not.toBe(results);
    expect(shuffled.map((r) => r.appId).sort()).toEqual([1, 2, 3]);
    expect(results.map((r) => r.appId)).toEqual([1, 2, 3]);
  });
});
