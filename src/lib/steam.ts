/** Wywołania nieoficjalnego Steam Store API. Tylko server-side (API routes) --
 * przeglądarka nie może wołać Steama bezpośrednio (brak CORS). Dokładne
 * endpointy i uzasadnienie: work/active/Tumolec.md w vaulcie Obsidian. */

export type SteamSearchResult = {
  steamAppId: number;
  name: string;
  tinyImage: string;
};

export type SteamCacheEntry = {
  name: string;
  headerImageUrl: string;
  steamUrl: string;
  shortDescription: string;
  reviewSummary: string;
  reviewScorePercent: number;
  tags: string[];
  minRequirements: string;
  recRequirements: string;
  cachedAt: number;
  developers: string[];
  releaseDate: { comingSoon: boolean; date: string } | null;
  screenshots: string[];
  trailerHlsUrl: string | null;
  trailerThumbnail: string | null;
  totalReviews: number;
};

export async function searchSteamGames(term: string): Promise<SteamSearchResult[]> {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=polish&cc=PL`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`storesearch failed: ${res.status}`);
  const data = (await res.json()) as { items?: { id: number; name: string; tiny_image: string }[] };
  return (data.items ?? []).map((item) => ({
    steamAppId: item.id,
    name: item.name,
    tinyImage: item.tiny_image,
  }));
}

type RawAppDetailsData = {
  name: string;
  header_image: string;
  short_description: string;
  genres?: { description: string }[];
  categories?: { description: string }[];
  pc_requirements?: { minimum?: string; recommended?: string } | [];
  developers?: string[];
  release_date?: { coming_soon: boolean; date: string };
  screenshots?: { id: number; path_thumbnail: string; path_full: string }[];
  movies?: { id: number; name: string; thumbnail: string; hls_h264?: string; highlight?: boolean }[];
};

type AppDetailsResponse = Record<string, { success: boolean; data?: RawAppDetailsData }>;

type AppReviewsResponse = {
  query_summary?: {
    review_score_desc: string;
    total_positive: number;
    total_reviews: number;
  };
};

/** Czysta funkcja parsowania -- wydzielona z fetchSteamGameDetails żeby dało
 * się ją testować bez sieci. steamAppId niewykorzystywany dziś w wyniku, ale
 * zostaje w sygnaturze na wypadek przyszłej walidacji spójności appid<->data. */
export function parseSteamAppDetails(
  steamAppId: number,
  data: RawAppDetailsData,
  reviews: AppReviewsResponse,
): SteamCacheEntry {
  const summary = reviews.query_summary;
  const tags = [
    ...(data.genres ?? []).map((g) => g.description),
    ...(data.categories ?? []).map((c) => c.description),
  ];
  const requirements = Array.isArray(data.pc_requirements) ? {} : (data.pc_requirements ?? {});
  const movie = data.movies?.[0];

  return {
    name: data.name,
    headerImageUrl: data.header_image,
    steamUrl: `https://store.steampowered.com/app/${steamAppId}`,
    shortDescription: data.short_description,
    reviewSummary: summary?.review_score_desc ?? "Brak ocen",
    reviewScorePercent:
      summary && summary.total_reviews > 0
        ? Math.round((summary.total_positive / summary.total_reviews) * 100)
        : 0,
    tags,
    minRequirements: requirements.minimum ?? "",
    recRequirements: requirements.recommended ?? "",
    cachedAt: Date.now(),
    developers: data.developers ?? [],
    releaseDate: data.release_date ? { comingSoon: data.release_date.coming_soon, date: data.release_date.date } : null,
    screenshots: (data.screenshots ?? []).map((s) => s.path_full),
    trailerHlsUrl: movie?.hls_h264 ?? null,
    trailerThumbnail: movie?.thumbnail ?? null,
    totalReviews: summary?.total_reviews ?? 0,
  };
}

export async function fetchSteamGameDetails(steamAppId: number): Promise<SteamCacheEntry> {
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=polish`;
  const reviewsUrl = `https://store.steampowered.com/appreviews/${steamAppId}?json=1&language=polish&purchase_type=all`;

  const [detailsRes, reviewsRes] = await Promise.all([fetch(detailsUrl), fetch(reviewsUrl)]);
  if (!detailsRes.ok) throw new Error(`appdetails failed: ${detailsRes.status}`);
  if (!reviewsRes.ok) throw new Error(`appreviews failed: ${reviewsRes.status}`);

  const details = (await detailsRes.json()) as AppDetailsResponse;
  const entry = details[String(steamAppId)];
  if (!entry?.success || !entry.data) {
    throw new Error(`Steam nie zwrócił danych dla appid ${steamAppId}`);
  }
  const reviews = (await reviewsRes.json()) as AppReviewsResponse;

  return parseSteamAppDetails(steamAppId, entry.data, reviews);
}
