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
  genres: string[];
  minRequirements: string;
  recRequirements: string;
  cachedAt: number;
  developers: string[];
  releaseDate: { comingSoon: boolean; date: string } | null;
  screenshots: string[];
  trailerHlsUrl: string | null;
  trailerThumbnail: string | null;
  totalReviews: number;
  topReviews: { author: string; text: string; votedUp: boolean }[];
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
  reviews?: {
    review: string;
    voted_up: boolean;
    votes_up: number;
    author: { personaname: string };
  }[];
};

const TOP_REVIEW_COUNT = 3;
const TOP_REVIEW_TEXT_MAX_LENGTH = 280;

/** Czysta funkcja parsowania -- wydzielona z fetchSteamGameDetails żeby dało
 * się ją testować bez sieci. steamAppId niewykorzystywany dziś w wyniku, ale
 * zostaje w sygnaturze na wypadek przyszłej walidacji spójności appid<->data. */
export function parseSteamAppDetails(
  steamAppId: number,
  data: RawAppDetailsData,
  reviews: AppReviewsResponse,
): SteamCacheEntry {
  const summary = reviews.query_summary;
  const genres = [...new Set((data.genres ?? []).map((g) => g.description))];
  const tags = [...new Set([...genres, ...(data.categories ?? []).map((c) => c.description)])];

  const requirements = Array.isArray(data.pc_requirements) ? {} : (data.pc_requirements ?? {});
  const movie = data.movies?.[0];
  const topReviews = [...(reviews.reviews ?? [])]
    .sort((a, b) => b.votes_up - a.votes_up)
    .slice(0, TOP_REVIEW_COUNT)
    .map((r) => ({
      author: r.author.personaname,
      text:
        r.review.length > TOP_REVIEW_TEXT_MAX_LENGTH
          ? r.review.slice(0, TOP_REVIEW_TEXT_MAX_LENGTH).trimEnd() + "…"
          : r.review,
      votedUp: r.voted_up,
    }));

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
    genres,
    minRequirements: requirements.minimum ?? "",
    recRequirements: requirements.recommended ?? "",
    cachedAt: Date.now(),
    developers: data.developers ?? [],
    releaseDate: data.release_date ? { comingSoon: data.release_date.coming_soon, date: data.release_date.date } : null,
    screenshots: (data.screenshots ?? []).map((s) => s.path_full),
    trailerHlsUrl: movie?.hls_h264 ?? null,
    trailerThumbnail: movie?.thumbnail ?? null,
    totalReviews: summary?.total_reviews ?? 0,
    topReviews,
  };
}

export async function fetchSteamGameDetails(steamAppId: number): Promise<SteamCacheEntry> {
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=polish`;
  const reviewsUrl = `https://store.steampowered.com/appreviews/${steamAppId}?json=1&language=polish&purchase_type=all&num_per_page=10`;

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

/** Steam nie publikuje oficjalnej listy ID tagów -- wyznaczone i zweryfikowane
 * przez `GET https://store.steampowered.com/tagdata/populartags/polish`
 * (oficjalny endpoint Steama, ten sam co zasila filtr tagów na sklepie).
 * Nazwy tagów Steama różnią się nieco od `GENRE_OPTIONS` (np. tag to
 * "Strategiczne", genre to "Strategie") -- to ten sam gatunek, ID potwierdzone
 * ręcznie (tags=9 zwraca RimWorld/Factorio/Crusader Kings III itd.). */
export const GENRE_TAG_IDS: Record<string, number> = {
  Akcja: 19,
  Przygodowe: 21,
  RPG: 122,
  Strategie: 9,
  Symulacje: 599,
  Niezależne: 492,
  Rekreacyjne: 597,
  Sportowe: 701,
};

/** Czysta funkcja parsowania -- jedyny endpoint Steama w projekcie zwracający
 * HTML (`results_html`) zamiast JSON. Wyciąga appid z każdego wyniku wyszukiwania
 * przez `data-ds-appid="N"`. Zweryfikowane na żywo: zwykły regex wystarcza,
 * kształt HTML jest stabilny -- brak potrzeby nowej zależności (cheerio). */
export function parseDiscoverAppIds(resultsHtml: string): number[] {
  return [...resultsHtml.matchAll(/data-ds-appid="(\d+)"/g)].map((m) => Number(m[1]));
}

export type DiscoverPage = { appIds: number[]; hasMore: boolean };

/** `tagIds` puste = przeglądanie całego katalogu bez filtra (domyślne
 * sortowanie Steama = najpopularniejsze/bestsellery, nic dodatkowego nie
 * trzeba przekazywać). `count=25` na stronę, `start` to kursor paginacji
 * Steama (nie mylić z lokalnym cursorRef ekranów swipe). */
export async function fetchDiscoverPage(tagIds: number[], start: number): Promise<DiscoverPage> {
  const count = 25;
  const tagsParam = tagIds.length > 0 ? `&tags=${tagIds.join(",")}` : "";
  const url = `https://store.steampowered.com/search/results/?query&start=${start}&count=${count}&infinite=1&l=polish${tagsParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search/results failed: ${res.status}`);
  const data = (await res.json()) as { results_html: string; total_count: number };
  const appIds = parseDiscoverAppIds(data.results_html);
  return { appIds, hasMore: start + appIds.length < data.total_count };
}
