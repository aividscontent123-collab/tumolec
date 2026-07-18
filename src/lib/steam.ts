/** Wywołania nieoficjalnego Steam Store API. Tylko server-side (API routes) --
 * przeglądarka nie może wołać Steama bezpośrednio (brak CORS). Dokładne
 * endpointy i uzasadnienie: work/active/Tumolec.md w vaulcie Obsidian. */

import { STEAM_TAG_CATALOG } from "@/lib/steamTagCatalog";

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
  hltbMainStory?: number | null;
  hltbCachedAt?: number | null;
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
 * Nazwy tagów Steama czasem różnią się gramatycznie od tego co faktycznie ląduje
 * w `game.tags` (np. tag to "Strategiczne", kategoria appdetails to "Strategie";
 * "Wieloosobowe" vs "Wieloosobowa") -- to ten sam koncept, ID potwierdzone ręcznie
 * (tags=9 zwraca RimWorld/Factorio/Crusader Kings III itd.). Znane rozbieżności
 * nadpisane jawnie w TAG_ID_OVERRIDES, reszta katalogu dopasowywana po dokładnej
 * nazwie z STEAM_TAG_CATALOG. */
const TAG_ID_OVERRIDES: Record<string, number> = {
  Strategie: 9,
  Symulacje: 599,
  Wieloosobowa: 3859, // "Wieloosobowe" w oficjalnej liście, ten sam koncept
};

export function resolveSteamTagId(filterValue: string): number | undefined {
  return TAG_ID_OVERRIDES[filterValue] ?? STEAM_TAG_CATALOG.find((t) => t.name === filterValue)?.id;
}

/** Puste `selected` = brak filtra. W przeciwnym razie gra musi mieć CO NAJMNIEJ
 * jeden z wybranych tagów -- sprawdzany dwoma niezależnymi sygnałami: (1) czy
 * tag jest wśród `tags` gry (genres+categories z appdetails -- pokrywa 8
 * gatunków, Kooperację, Multiplayer), (2) czy candidateTagIds (tagIds
 * społecznościowe Steama z tej samej strony wyników co appid, dostępne TYLKO
 * dla kandydatów ze źródła "Cały katalog Steam" -- appdetails ich nie zwraca
 * w ogóle) zawiera ID odpowiadające temu tagowi. `candidateTagIds === null`
 * (źródło biblioteka/wspólna pula, gdzie nie mamy tej strony wyników wcale)
 * degraduje dokładnie do sprawdzenia (1) -- znane ograniczenie: tagi spoza
 * genres/categories (np. Metroidvania, Roguelike) nigdy nie dopasują niczego
 * w tych dwóch źródłach, tylko w katalogu. */
export function matchesTagOrCommunityFilter(
  tags: string[],
  candidateTagIds: number[] | null,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  return selected.some((tag) => {
    if (tags.includes(tag)) return true;
    if (candidateTagIds === null) return false;
    const id = resolveSteamTagId(tag);
    return id !== undefined && candidateTagIds.includes(id);
  });
}

/** Czysta funkcja parsowania -- jedyny endpoint Steama w projekcie zwracający
 * HTML (`results_html`) zamiast JSON. Wyciąga appid z każdego wyniku wyszukiwania
 * przez `data-ds-appid="N"`. Zweryfikowane na żywo: zwykły regex wystarcza,
 * kształt HTML jest stabilny -- brak potrzeby nowej zależności (cheerio). */
export function parseDiscoverAppIds(resultsHtml: string): number[] {
  return [...resultsHtml.matchAll(/data-ds-appid="(\d+)"/g)].map((m) => Number(m[1]));
}

export type DiscoverResult = { appId: number; tagIds: number[] };

/** Jak parseDiscoverAppIds, ale wyciąga też `data-ds-tagids` -- lista ID
 * tagów społecznościowych Steama przypisanych do KAŻDEJ gry. To inny system
 * niż genres/categories z appdetails (appdetails ich w ogóle nie zwraca) --
 * tagIds z tej strony wyników to jedyny sposób dopasowania tagów spoza
 * genres/categories (np. Metroidvania, Roguelike) bez dodatkowego zapytania
 * per gra. Dzieli HTML na fragmenty per-wynik (każdy zaczyna się od
 * `<a ...data-ds-appid=`) i szuka obu atrybutów NIEZALEŻNIE w obrębie
 * fragmentu, bo kolejność/obecność atrybutów bywa różna między wynikami
 * (zweryfikowane na żywo). Brak data-ds-tagids u danego wyniku = pusta
 * tablica, nie błąd. */
export function parseDiscoverResults(resultsHtml: string): DiscoverResult[] {
  const chunks = resultsHtml.split(/(?=<a[^>]*\bdata-ds-appid=)/);
  const results: DiscoverResult[] = [];
  for (const chunk of chunks) {
    const appIdMatch = chunk.match(/data-ds-appid="(\d+)"/);
    if (!appIdMatch) continue;
    const tagIdsMatch = chunk.match(/data-ds-tagids="\[([\d,]*)\]"/);
    const tagIds = tagIdsMatch
      ? tagIdsMatch[1]
          .split(",")
          .filter(Boolean)
          .map((s) => Number(s))
      : [];
    results.push({ appId: Number(appIdMatch[1]), tagIds });
  }
  return results;
}

const DISCOVER_PAGE_SIZE = 25;

/** Losuje offset wyrównany do rozmiaru strony w granicach realnego
 * total_count danego filtra -- nigdy nie "przestrzeli" w pustkę, w
 * przeciwieństwie do ślepego losowania w stałym zakresie. */
export function computeRandomDiscoverStart(totalCount: number, pageSize = DISCOVER_PAGE_SIZE): number {
  const maxOffset = Math.max(0, totalCount - pageSize);
  const maxPageIndex = Math.floor(maxOffset / pageSize);
  return Math.floor(Math.random() * (maxPageIndex + 1)) * pageSize;
}

/** Fisher-Yates, wzorem shuffleGames w steamLibrary.ts. */
export function shuffleDiscoverResults(results: DiscoverResult[]): DiscoverResult[] {
  const arr = [...results];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export type DiscoverPage = { results: DiscoverResult[]; hasMore: boolean; start: number };

/** `tagIds` puste = przeglądanie całego katalogu bez filtra (domyślne
 * sortowanie Steama = najpopularniejsze/bestsellery, nic dodatkowego nie
 * trzeba przekazywać). `count=25` na stronę, `start` to kursor paginacji
 * Steama (nie mylić z lokalnym cursorRef ekranów swipe). Zwraca `results`
 * (appId + tagIds społecznościowe każdej gry) zamiast samych appidów.
 *
 * `options.randomize`: gdy true, ignoruje przekazany `start`, robi
 * dodatkowe lekkie zapytanie (`count=1`) żeby poznać total_count dla tego
 * filtra, losuje offset wyrównany do strony w jego granicach (nigdy nie
 * przestrzeli w pustkę), i tasuje kolejność zwróconej strony. Zwrócony
 * `start` to FAKTYCZNIE użyty offset -- wołający ma kontynuować kolejne
 * strony od niego, nie od wartości którą przekazał. */
export async function fetchDiscoverPage(
  tagIds: number[],
  start: number,
  options?: { randomize?: boolean },
): Promise<DiscoverPage> {
  const tagsParam = tagIds.length > 0 ? `&tags=${tagIds.join(",")}` : "";
  let effectiveStart = start;

  if (options?.randomize) {
    const probeUrl = `https://store.steampowered.com/search/results/?query&start=0&count=1&infinite=1&l=polish${tagsParam}`;
    const probeRes = await fetch(probeUrl);
    if (probeRes.ok) {
      const probeData = (await probeRes.json()) as { total_count: number };
      effectiveStart = computeRandomDiscoverStart(probeData.total_count);
    }
  }

  const url = `https://store.steampowered.com/search/results/?query&start=${effectiveStart}&count=${DISCOVER_PAGE_SIZE}&infinite=1&l=polish${tagsParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search/results failed: ${res.status}`);
  const data = (await res.json()) as { results_html: string; total_count: number };
  const results = parseDiscoverResults(data.results_html);
  const finalResults = options?.randomize ? shuffleDiscoverResults(results) : results;
  return {
    results: finalResults,
    hasMore: effectiveStart + finalResults.length < data.total_count,
    start: effectiveStart,
  };
}
