# Panele szczegółów gry (Dustpile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wzbogacić ekran swipe (solo i pokój) o panel mediów (trailer HLS + screenshoty) i panel premiery/opinii Steam wokół przeprojektowanej, mniejszej wycentrowanej karty gry — responsywnie (3 kolumny desktop, akordeon telefon).

**Architecture:** Rozszerzenie istniejącego `SteamCacheEntry`/`SwipeGame` o pola już dostępne w `appdetails` (developers, release_date, screenshots, movies, shortDescription) bez nowych zapytań sieciowych. Nowy `GameDetailLayout` otacza istniejącą (przeprojektowaną) `SwipeCard` w obu miejscach użycia (`SoloSwipeScreen.tsx`, `SwipeScreen.tsx`) i renderuje `MediaPanel`/`ReleaseOrReviewsPanel` jako CSS-grid kolumny (desktop) albo akordeon sterowany lokalnym stanem (telefon). Trailer używa `hls.js` (nowa zależność) do odtwarzania strumienia HLS poza Safari/iOS.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Firebase Firestore (cache), hls.js (nowa zależność) dla wideo, Vitest dla testów czystych funkcji.

## Global Constraints

- Zero nowych zapytań HTTP do Steama — wszystkie nowe pola pochodzą z JUŻ wołanego `appdetails` w `fetchSteamGameDetails` (`src/lib/steam.ts`).
- Zero fejkowych statystyk (hype score, liczba obserwujących, liczba graczy demo) — Steam Store API ich nie ma, nie są przybliżane. Dla wydanych gier realny odpowiednik to `totalReviews`.
- Gest swipe (`useDrag`, `framer-motion`, poświata, `decideSwipeDirection`) w `SwipeCard` **bez zmian mechaniki** — zmienia się tylko układ wewnątrz karty.
- Odznaka "X% Steam" znika z karty, przenosi się w całości do `ReleaseOrReviewsPanel`.
- `GameDetailLayout` używany w OBU miejscach: `SoloSwipeScreen.tsx` i `SwipeScreen.tsx` (`RoundVoting`).
- Kod polski (etykiety, komunikaty, komentarze).
- Po każdym zadaniu: `npm run build` bez błędów typów.
- Panel bez danych (brak trailera+screenshotów, brak release_date) renderuje `null` całkowicie — nie pustą kolumnę/chip.
- Styl: kontynuować istniejące tokeny (`bg-card`, `border-border`, `bg-secondary`, `bg-accent-brand`, `text-text-secondary`, `rounded-card`, `--accent-brand-soft`).

---

## Kontekst dla implementującego

Repo: `C:\Users\miros\tumolec`. Pliki źródłowe do przeczytania przed startem:
- `src/lib/steam.ts` — `fetchSteamGameDetails`, `SteamCacheEntry`, dziś parsuje tylko część `appdetails`
- `src/app/api/steam/details/route.ts` — cache Firestore `steam_cache/{steamAppId}`, TTL 30 dni
- `src/lib/types.ts` — `SwipeGame` (subset `SteamCacheEntry` do UI)
- `src/components/swipe/SwipeCard.tsx` — dzisiejsza pełnoekranowa karta (gest swipe, TO ZOSTAJE bez zmian mechaniki)
- `src/components/swipe/SwipeActionButtons.tsx` — przyciski pod kartą (bez zmian)
- `src/lib/steamImages.ts` — `steamLibraryPortraitUrl` (źródło obrazka karty, bez zmian)
- `src/components/solo/SoloSwipeScreen.tsx` — miejsce użycia #1 karty (tryb solo)
- `src/components/room/SwipeScreen.tsx` — miejsce użycia #2 karty (`RoundVoting`, tryb pokoju)
- `firestore.rules` — walidacja `steam_cache` (sekcja `match /steam_cache/{steamAppId}`, `hasOnly` lista kluczy)
- `src/lib/history.ts` + `src/lib/history.test.ts` — wzorzec czystej funkcji + testu do naśladowania dla `releaseCountdown.ts`

**Zweryfikowany na żywo kształt nowych pól ze Steam `appdetails` (appid 1145360, Hades):**
```json
{
  "developers": ["Supergiant Games"],
  "release_date": { "coming_soon": false, "date": "17 września 2020" },
  "screenshots": [{ "id": 0, "path_thumbnail": "https://...600x338.jpg", "path_full": "https://...1920x1080.jpg" }],
  "movies": [{
    "id": 256801252,
    "name": "Hades - v1.0 Launch Trailer",
    "thumbnail": "https://...movie.293x165.jpg",
    "hls_h264": "https://video.akamai.steamstatic.com/store_trailers/.../hls_264_master.m3u8?t=...",
    "highlight": true
  }]
}
```
Data w formacie polskim to pełna nazwa miesiąca w dopełniaczu ("17 września 2020"), NIE skrót. `release_date` bywa `undefined` całkowicie dla starych/niszowych gier — traktować jak `null`.

---

## Task 1: Rozszerz `SteamCacheEntry` i sparsuj nowe pola z `appdetails`

**Files:**
- Modify: `src/lib/steam.ts`
- Test: `src/lib/steam.test.ts` (nowy)

**Interfaces:**
- Produces: `SteamCacheEntry` z nowymi polami `developers: string[]`, `releaseDate: { comingSoon: boolean; date: string } | null`, `screenshots: string[]`, `trailerHlsUrl: string | null`, `trailerThumbnail: string | null`, `totalReviews: number`
- Produces: `parseSteamAppDetails(steamAppId: number, data: RawAppDetailsData, reviews: AppReviewsResponse): SteamCacheEntry` (czysta funkcja wydzielona z `fetchSteamGameDetails`, testowalna bez sieci)

- [ ] **Step 1: Napisz failing test dla `parseSteamAppDetails`**

Stwórz `src/lib/steam.test.ts`:

```typescript
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
```

- [ ] **Step 2: Uruchom test, potwierdź że pada**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: FAIL — `parseSteamAppDetails is not exported` / `is not a function`

- [ ] **Step 3: Zaimplementuj `parseSteamAppDetails` i rozszerz `SteamCacheEntry`**

W `src/lib/steam.ts` zamień CAŁY plik na:

```typescript
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
```

- [ ] **Step 4: Uruchom test, potwierdź że przechodzi**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: PASS (2 testy)

- [ ] **Step 5: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów (inne pliki jeszcze nie czytają nowych pól, więc nie ma tu żadnych błędów typów spoza tego pliku)

- [ ] **Step 6: Commit**

```bash
git add src/lib/steam.ts src/lib/steam.test.ts
git commit -m "feat: sparsuj developers/release_date/screenshots/trailer/totalReviews z appdetails"
```

---

## Task 2: Rozszerz `SwipeGame` (wraz z `shortDescription`) i wszystkie miejsca budujące karty gry

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/components/solo/SoloSwipeScreen.tsx:11-19` (typ `DetailsResponse`, budowanie `SwipeGame` w `advance()`)
- Modify: `src/lib/rooms.ts` (budowanie `PoolGame` z `steam_cache`)
- Modify: `src/app/demo/page.tsx` (stała `demoGame`)

**Interfaces:**
- Produces: `SwipeGame` z nowymi polami `developers: string[]`, `releaseDate: { comingSoon: boolean; date: string } | null`, `screenshots: string[]`, `trailerHlsUrl: string | null`, `trailerThumbnail: string | null`, `totalReviews: number`, `shortDescription: string`

- [ ] **Step 1: Rozszerz `SwipeGame`**

W `src/lib/types.ts`, zamień cały plik na:

```typescript
/** Subset of steam_cache/{steamAppId} used by swipe UI components.
 * Full model: work/active/Tumolec.md w vaulcie Obsidian. */
export type SwipeGame = {
  steamAppId: number;
  title: string;
  /** Steam CDN header image URL. Undefined -> render placeholder cover. */
  coverImageUrl?: string;
  tags: string[];
  reviewScorePercent: number;
  reviewSummary: string;
  shortDescription: string;
  developers: string[];
  releaseDate: { comingSoon: boolean; date: string } | null;
  screenshots: string[];
  trailerHlsUrl: string | null;
  trailerThumbnail: string | null;
  totalReviews: number;
};
```

- [ ] **Step 2: Zaktualizuj `DetailsResponse` i budowanie `SwipeGame` w `SoloSwipeScreen.tsx`**

W `src/components/solo/SoloSwipeScreen.tsx`, zmień:

```typescript
type DetailsResponse = {
  steamAppId: number;
  name: string;
  headerImageUrl: string;
  tags: string[];
  reviewScorePercent: number;
  reviewSummary: string;
  error?: string;
};
```

na:

```typescript
type DetailsResponse = {
  steamAppId: number;
  name: string;
  headerImageUrl: string;
  tags: string[];
  reviewScorePercent: number;
  reviewSummary: string;
  shortDescription: string;
  developers: string[];
  releaseDate: { comingSoon: boolean; date: string } | null;
  screenshots: string[];
  trailerHlsUrl: string | null;
  trailerThumbnail: string | null;
  totalReviews: number;
  error?: string;
};
```

I zaktualizuj budowanie `SwipeGame` w `advance()` (ten sam plik), zmień:

```typescript
        setCurrentCard({
          steamAppId: data.steamAppId,
          title: data.name,
          coverImageUrl: data.headerImageUrl,
          tags: data.tags,
          reviewScorePercent: data.reviewScorePercent,
          reviewSummary: data.reviewSummary,
        });
```

na:

```typescript
        setCurrentCard({
          steamAppId: data.steamAppId,
          title: data.name,
          coverImageUrl: data.headerImageUrl,
          tags: data.tags,
          reviewScorePercent: data.reviewScorePercent,
          reviewSummary: data.reviewSummary,
          shortDescription: data.shortDescription,
          developers: data.developers,
          releaseDate: data.releaseDate,
          screenshots: data.screenshots,
          trailerHlsUrl: data.trailerHlsUrl,
          trailerThumbnail: data.trailerThumbnail,
          totalReviews: data.totalReviews,
        });
```

**Uwaga:** `/api/steam/details` (route.ts) zwraca `{ steamAppId, ...cacheEntry }` gdzie `cacheEntry` to `SteamCacheEntry` z Task 1 -- nowe pola (w tym `shortDescription`, które już istniało w `SteamCacheEntry` od zawsze) przechodzą przez ten spread automatycznie, bez zmian w `route.ts`.

- [ ] **Step 3: Znajdź WSZYSTKIE pozostałe miejsca budujące `SwipeGame`/`PoolGame`**

Run: `grep -rn "reviewScorePercent:" src/lib/rooms.ts src/app/demo/page.tsx`

Oczekiwane trafienia: jedno w `src/lib/rooms.ts` (funkcja budująca `PoolGame` z dokumentu `steam_cache` -- `PoolGame` rozszerza `SwipeGame` polami `addedBy`/`status`/`playedAt`) i jedno w `src/app/demo/page.tsx` (statyczny obiekt `demoGame`).

Dla miejsca w `src/lib/rooms.ts`: dodaj do konstruowanego obiektu (obok istniejącego `reviewScorePercent: cache.reviewScorePercent,` itp.):
```typescript
      shortDescription: cache.shortDescription ?? "",
      developers: cache.developers ?? [],
      releaseDate: cache.releaseDate ?? null,
      screenshots: cache.screenshots ?? [],
      trailerHlsUrl: cache.trailerHlsUrl ?? null,
      trailerThumbnail: cache.trailerThumbnail ?? null,
      totalReviews: cache.totalReviews ?? 0,
```
(Fallbacki na wypadek starych wpisów `steam_cache` sprzed tej zmiany, które nie mają jeszcze tych pól -- traktowane jak brak danych, zgodnie ze specem.)

Dla `src/app/demo/page.tsx`, w stałej `demoGame`, dodaj:
```typescript
  shortDescription: "Rakietowa, chaotyczna kooperacyjna gra kucharska dla 1-4 graczy.",
  developers: ["Ghost Town Games"],
  releaseDate: { comingSoon: false, date: "7 sierpnia 2018" },
  screenshots: [],
  trailerHlsUrl: null,
  trailerThumbnail: null,
  totalReviews: 12000,
```

- [ ] **Step 4: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów typów. Jeśli pojawi się błąd "Property X is missing" w innym pliku niż wymienione wyżej (np. inny builder `PoolGame` w `rooms.ts` którego grep nie złapał), TypeScript wskaże dokładną linię -- dodaj tam te same 7 pól z fallbackami jak w Step 3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/components/solo/SoloSwipeScreen.tsx src/lib/rooms.ts src/app/demo/page.tsx
git commit -m "feat: rozszerz SwipeGame o shortDescription/developers/releaseDate/screenshots/trailer/totalReviews"
```

---

## Task 3: `daysUntil` -- czysta funkcja liczenia dni do premiery

**Files:**
- Create: `src/lib/releaseCountdown.ts`
- Test: `src/lib/releaseCountdown.test.ts`

**Interfaces:**
- Produces: `daysUntil(dateString: string, now?: Date): number | null`

- [ ] **Step 1: Napisz failing testy**

Stwórz `src/lib/releaseCountdown.test.ts`:

```typescript
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
```

- [ ] **Step 2: Uruchom testy, potwierdź że padają**

Run: `npx vitest run src/lib/releaseCountdown.test.ts`
Expected: FAIL -- `Cannot find module './releaseCountdown'`

- [ ] **Step 3: Zaimplementuj `daysUntil`**

Stwórz `src/lib/releaseCountdown.ts`:

```typescript
/** Liczy dni do premiery z polskiej daty Steama (np. "17 lipca 2026",
 * dopełniacz miesiąca -- tak formatuje Steam appdetails przy l=polish).
 * Zwraca null gdy string nie pasuje do wzorca "D miesiąc RRRR" (Steam czasem
 * zwraca nieprecyzyjne daty typu "2026", "Q3 2026", "Wkrótce" dla gier bez
 * ustalonej daty -- panel wtedy pokazuje samą datę tekstową, bez liczby dni). */
const POLISH_MONTHS: Record<string, number> = {
  stycznia: 0,
  lutego: 1,
  marca: 2,
  kwietnia: 3,
  maja: 4,
  czerwca: 5,
  lipca: 6,
  sierpnia: 7,
  września: 8,
  października: 9,
  listopada: 10,
  grudnia: 11,
};

export function daysUntil(dateString: string, now: Date = new Date()): number | null {
  const match = dateString.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/u);
  if (!match) return null;
  const [, dayStr, monthName, yearStr] = match;
  const month = POLISH_MONTHS[monthName.toLowerCase()];
  if (month === undefined) return null;

  const day = Number(dayStr);
  const year = Number(yearStr);
  const releaseDate = new Date(Date.UTC(year, month, day));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const diffMs = releaseDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 4: Uruchom testy, potwierdź że przechodzą**

Run: `npx vitest run src/lib/releaseCountdown.test.ts`
Expected: PASS (5 testów)

- [ ] **Step 5: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów

- [ ] **Step 6: Commit**

```bash
git add src/lib/releaseCountdown.ts src/lib/releaseCountdown.test.ts
git commit -m "feat: daysUntil - licz dni do premiery z polskiej daty Steama"
```

---

## Task 4: Zainstaluj `hls.js`, stwórz `HlsVideo`

**Files:**
- Modify: `package.json` (nowa zależność)
- Create: `src/components/swipe/HlsVideo.tsx`

**Interfaces:**
- Produces: `HlsVideo({ hlsUrl, poster }: { hlsUrl: string; poster?: string }): JSX.Element`

- [ ] **Step 1: Zainstaluj hls.js**

Run: `npm install hls.js@^1.6.16`
Expected: dodane do `dependencies` w `package.json`, `package-lock.json` zaktualizowany

- [ ] **Step 2: Stwórz `src/components/swipe/HlsVideo.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

/** Odtwarzacz trailera Steam. Steam appdetails zwraca dziś trailery WYŁĄCZNIE
 * jako manifesty HLS (.m3u8), nie bezpośrednie pliki mp4/webm (zweryfikowane
 * na żywym API 2026-07-14) -- HLS gra natywnie tylko w Safari/iOS, więc
 * gdzie indziej (Chrome/Firefox/Android) używamy hls.js jako fallback. */
export function HlsVideo({ hlsUrl, poster }: { hlsUrl: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
  }, [hlsUrl]);

  return (
    <video
      ref={videoRef}
      controls
      poster={poster}
      className="aspect-video w-full rounded-xl bg-black"
    />
  );
}
```

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów (komponent jeszcze nieużywany nigdzie, ale musi się kompilować samodzielnie)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/swipe/HlsVideo.tsx
git commit -m "feat: HlsVideo - odtwarzacz trailera Steam przez hls.js"
```

---

## Task 5: `MediaPanel`

**Files:**
- Create: `src/components/swipe/MediaPanel.tsx`

**Interfaces:**
- Consumes: `HlsVideo` (Task 4), pola `screenshots`/`trailerHlsUrl`/`trailerThumbnail` z `SwipeGame` (Task 2)
- Produces: `MediaPanel({ game }: { game: SwipeGame }): JSX.Element | null`

- [ ] **Step 1: Stwórz `src/components/swipe/MediaPanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { HlsVideo } from "@/components/swipe/HlsVideo";
import type { SwipeGame } from "@/lib/types";

/** Panel mediów gry: trailer (jeśli jest) + siatka miniatur screenshotów
 * (jeśli są). Renderuje null gdy nie ma ani jednego ani drugiego -- pozwala
 * rodzicowi (GameDetailLayout) całkowicie pominąć kolumnę/chip zamiast
 * pokazywać pustą sekcję. */
export function MediaPanel({ game }: { game: SwipeGame }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (!game.trailerHlsUrl && game.screenshots.length === 0) return null;

  return (
    <div className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-4">
      {game.trailerHlsUrl && (
        <HlsVideo hlsUrl={game.trailerHlsUrl} poster={game.trailerThumbnail ?? undefined} />
      )}

      {game.screenshots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {game.screenshots.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => setLightbox(url)}
              className="relative aspect-video overflow-hidden rounded-lg"
            >
              <Image src={url} alt="" fill className="object-cover" sizes="120px" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Sprawdź domenę Steam CDN w `next.config.ts`**

Run: `grep -A 5 "remotePatterns" next.config.ts`

`next.config.ts` już zawiera `{ protocol: "https", hostname: "*.steamstatic.com" }` i `{ protocol: "https", hostname: "*.akamai.steamstatic.com" }`, co pokrywa `shared.akamai.steamstatic.com` (domena screenshotów i miniatur trailerów) -- **nic do zmiany**, to tylko krok weryfikacyjny.

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów

- [ ] **Step 4: Commit**

```bash
git add src/components/swipe/MediaPanel.tsx
git commit -m "feat: MediaPanel - trailer + siatka screenshotow z lightboxem"
```

---

## Task 6: `ReleaseOrReviewsPanel`

**Files:**
- Create: `src/components/swipe/ReleaseOrReviewsPanel.tsx`

**Interfaces:**
- Consumes: `daysUntil` (Task 3), pola `releaseDate`/`reviewScorePercent`/`reviewSummary`/`totalReviews`/`steamAppId` z `SwipeGame` (Task 2)
- Produces: `ReleaseOrReviewsPanel({ game }: { game: SwipeGame }): JSX.Element`

- [ ] **Step 1: Stwórz `src/components/swipe/ReleaseOrReviewsPanel.tsx`**

```tsx
"use client";

import { daysUntil } from "@/lib/releaseCountdown";
import type { SwipeGame } from "@/lib/types";

/** Panel kontekstowy: dla gier nadchodzących (releaseDate.comingSoon) pokazuje
 * odliczanie do premiery + link do listy życzeń Steam. Dla wydanych (albo bez
 * release_date w ogóle -- traktowane jak wydane) pokazuje opinie Steam.
 * Świadomie BEZ hype score/obserwujących/graczy demo -- Steam Store API tych
 * danych nie ma, nie są przybliżane fejkowymi liczbami. */
export function ReleaseOrReviewsPanel({ game }: { game: SwipeGame }) {
  const isUpcoming = game.releaseDate?.comingSoon === true;

  if (isUpcoming) {
    const days = daysUntil(game.releaseDate!.date);
    return (
      <div className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-4">
        <h3 className="font-heading text-sm font-bold text-foreground">Przed premierą</h3>
        <div className="bg-secondary rounded-xl p-4 text-center">
          {days !== null && (
            <div className="font-heading text-2xl font-bold text-foreground">
              {days > 0 ? `Za ${days} dni` : days === 0 ? "Dziś!" : "Już dostępne"}
            </div>
          )}
          <div className="text-text-secondary text-sm">{game.releaseDate!.date}</div>
        </div>
        <a
          href={`https://store.steampowered.com/app/${game.steamAppId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-accent-brand rounded-full py-3 text-center text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
        >
          Dodaj do listy życzeń
        </a>
      </div>
    );
  }

  return (
    <div className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-4">
      <h3 className="font-heading text-sm font-bold text-foreground">Opinie Steam</h3>
      <div className="bg-secondary rounded-xl p-4 text-center">
        <div className="font-heading text-rating text-2xl font-bold">{game.reviewScorePercent}%</div>
        <div className="text-text-secondary text-sm">{game.reviewSummary}</div>
        <div className="text-text-secondary mt-1 text-xs">{game.totalReviews.toLocaleString("pl-PL")} recenzji</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów

- [ ] **Step 3: Commit**

```bash
git add src/components/swipe/ReleaseOrReviewsPanel.tsx
git commit -m "feat: ReleaseOrReviewsPanel - odliczanie premiery albo opinie Steam"
```

---

## Task 7: Przeprojektuj `SwipeCard` (mniejsze wycentrowane zdjęcie, metadane i opis pod spodem)

**Files:**
- Modify: `src/components/swipe/SwipeCard.tsx`

**Interfaces:**
- Consumes: rozszerzony `SwipeGame` (Task 2: `developers`, `releaseDate`, `shortDescription`)
- Produces: `SwipeCard` -- sygnatura propsów BEZ ZMIAN (`{ game, onSwipe }`), zmienia się tylko JSX wewnątrz

- [ ] **Step 1: Zamień JSX karty -- zdjęcie mniejsze i wycentrowane, metadane i opis jako tekst pod spodem**

W `src/components/swipe/SwipeCard.tsx`, zamień CAŁY `return (...)` (od `return (` do zamykającego `);` na końcu funkcji) na:

```tsx
  const releaseYear = game.releaseDate?.date.match(/\d{4}$/u)?.[0];
  const subtitle = [releaseYear, game.developers.join(", ")].filter(Boolean).join(" · ");

  return (
    <motion.div
      {...(bind() as object)}
      style={{ x, y, rotate, boxShadow: glowShadow, touchAction: "pan-y" }}
      className="rounded-card bg-card border-border relative flex h-full w-full cursor-grab flex-col overflow-hidden border active:cursor-grabbing"
    >
      <motion.div
        style={{ opacity: likeOpacity }}
        className="border-rating text-rating absolute top-6 left-6 z-10 -rotate-12 rounded-xl border-4 px-3 py-1 text-xl font-extrabold tracking-wide uppercase"
      >
        Gramy
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="border-pass text-pass absolute top-6 right-6 z-10 rotate-12 rounded-xl border-4 px-3 py-1 text-xl font-extrabold tracking-wide uppercase"
      >
        Pas
      </motion.div>

      <div className="relative mx-auto mt-5 aspect-[3/4] w-3/5 shrink-0 overflow-hidden rounded-xl">
        {game.coverImageUrl && imgSrc ? (
          <Image
            src={imgSrc}
            alt={game.title}
            fill
            className="pointer-events-none object-cover"
            sizes="(max-width: 500px) 60vw, 300px"
            draggable={false}
            onError={() => {
              if (!portraitFailed) setPortraitFailed(true);
            }}
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              backgroundColor: "#3a2420",
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0 14px, transparent 14px 28px)",
            }}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-[22px]">
        <h2 className="font-heading text-center text-[24px] leading-tight font-bold text-foreground">
          {game.title}
        </h2>
        {subtitle && <p className="text-text-secondary text-center text-sm">{subtitle}</p>}

        <div className="flex flex-wrap justify-center gap-2">
          {game.tags.map((tag) => (
            <span
              key={tag}
              className="bg-secondary rounded-full px-3 py-1 text-xs font-semibold text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        {game.shortDescription && (
          <p className="text-text-secondary text-sm">{game.shortDescription}</p>
        )}

        <a
          href={`https://store.steampowered.com/app/${game.steamAppId}`}
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="bg-secondary mx-auto mt-1 inline-flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/15 active:scale-95"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Szczegóły na Steam
        </a>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów

- [ ] **Step 3: Ręczna weryfikacja wizualna**

Run: `npm run dev`, otwórz `/demo` (statyczny widok z danymi demo, bez potrzeby Steam API), potwierdź: zdjęcie gry mniejsze i wycentrowane (nie na całą kartę), tytuł/rok-twórca/tagi/opis/link pod spodem na zwykłym tle karty, gest przeciągania (drag na desktopie myszką) nadal działa (obrót, poświata, odznaki "Gramy"/"Pas").

- [ ] **Step 4: Commit**

```bash
git add src/components/swipe/SwipeCard.tsx
git commit -m "feat: przeprojektuj SwipeCard - mniejsze wycentrowane zdjecie, metadane i opis pod spodem"
```

---

## Task 8: `GameDetailLayout` -- responsywny grid desktop + akordeon telefon

**Files:**
- Create: `src/components/swipe/GameDetailLayout.tsx`

**Interfaces:**
- Consumes: `MediaPanel` (Task 5), `ReleaseOrReviewsPanel` (Task 6) -- ale NIE renderuje `SwipeCard` sam, przyjmuje go jako `children` (żeby wywołujący kontrolował `key`/`onSwipe` bez przecieku przez ten komponent)
- Produces: `GameDetailLayout({ game, children }: { game: SwipeGame; children: React.ReactNode }): JSX.Element`

- [ ] **Step 1: Stwórz `src/components/swipe/GameDetailLayout.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MediaPanel } from "@/components/swipe/MediaPanel";
import { ReleaseOrReviewsPanel } from "@/components/swipe/ReleaseOrReviewsPanel";
import type { SwipeGame } from "@/lib/types";

type MobilePanel = "media" | "info" | null;

/** Otacza kartę swipe (przekazaną jako children -- ten komponent nie zna
 * `onSwipe`/`key`, tylko układa panele wokół) panelami mediów i premiery/opinii.
 * Desktop (lg+): 3 kolumny widoczne naraz. Telefon: karta zawsze widoczna,
 * 2 chipsy nad nią rozwijają odpowiedni panel jako akordeon -- swipe nigdy nie
 * traci miejsca na ekranie. Panel bez danych (MediaPanel zwraca null) chowa
 * też swój chip na telefonie. */
export function GameDetailLayout({ game, children }: { game: SwipeGame; children: React.ReactNode }) {
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);

  const media = <MediaPanel game={game} />;
  const info = <ReleaseOrReviewsPanel game={game} />;
  const hasMedia = game.trailerHlsUrl !== null || game.screenshots.length > 0;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[340px_1fr_340px]">
      {hasMedia && <div className="hidden lg:block lg:overflow-y-auto">{media}</div>}

      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:contents">
        <div className="flex gap-2 lg:hidden">
          {hasMedia && (
            <button
              type="button"
              onClick={() => setMobilePanel((p) => (p === "media" ? null : "media"))}
              className={`flex-1 rounded-full py-2 text-xs font-bold ${mobilePanel === "media" ? "bg-accent-brand text-white" : "bg-secondary text-foreground"}`}
            >
              Media
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobilePanel((p) => (p === "info" ? null : "info"))}
            className={`flex-1 rounded-full py-2 text-xs font-bold ${mobilePanel === "info" ? "bg-accent-brand text-white" : "bg-secondary text-foreground"}`}
          >
            Info
          </button>
        </div>

        {mobilePanel === "media" && hasMedia && <div className="lg:hidden">{media}</div>}
        {mobilePanel === "info" && <div className="lg:hidden">{info}</div>}

        <div className="min-h-0 flex-1">{children}</div>
      </div>

      <div className="hidden lg:block lg:overflow-y-auto">{info}</div>
    </div>
  );
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów

- [ ] **Step 3: Commit**

```bash
git add src/components/swipe/GameDetailLayout.tsx
git commit -m "feat: GameDetailLayout - responsywny grid desktop + akordeon telefon"
```

---

## Task 9: Podłącz `GameDetailLayout` w `SoloSwipeScreen.tsx`

**Files:**
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

- [ ] **Step 1: Dodaj import**

```typescript
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
```

- [ ] **Step 2: Owiń `SwipeCard` layoutem**

Znajdź w `src/components/solo/SoloSwipeScreen.tsx`:

```tsx
      <div className="min-h-0 flex-1">
        {loadingCard ? (
          <p className="text-text-secondary p-6 text-center text-sm">Szukam kolejnej gry…</p>
        ) : exhausted ? (
          <p className="text-text-secondary p-6 text-center text-sm">
            To wszystkie gry pasujące do Twoich filtrów.
          </p>
        ) : currentCard ? (
          <SwipeCard key={currentCard.steamAppId} game={currentCard} onSwipe={handleSwipe} />
        ) : null}
      </div>
```

Zamień na:

```tsx
      <div className="min-h-0 flex-1">
        {loadingCard ? (
          <p className="text-text-secondary p-6 text-center text-sm">Szukam kolejnej gry…</p>
        ) : exhausted ? (
          <p className="text-text-secondary p-6 text-center text-sm">
            To wszystkie gry pasujące do Twoich filtrów.
          </p>
        ) : currentCard ? (
          <GameDetailLayout game={currentCard}>
            <SwipeCard key={currentCard.steamAppId} game={currentCard} onSwipe={handleSwipe} />
          </GameDetailLayout>
        ) : null}
      </div>
```

- [ ] **Step 3: Zweryfikuj build i ręcznie**

Run: `npm run build`
Expected: bez błędów

Ręcznie (`npm run dev`): wczytaj bibliotekę solo (profil Steam publiczny), na ekranie swipe potwierdź: telefon (wąskie okno) pokazuje kartę + chipsy Media/Info, desktop (szerokie okno, `lg:` breakpoint) pokazuje 3 kolumny naraz.

- [ ] **Step 4: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: podlacz GameDetailLayout w trybie solo"
```

---

## Task 10: Podłącz `GameDetailLayout` w `SwipeScreen.tsx` (tryb pokoju)

**Files:**
- Modify: `src/components/room/SwipeScreen.tsx`

- [ ] **Step 1: Dodaj import**

```typescript
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
```

- [ ] **Step 2: Owiń `SwipeCard` layoutem**

W `RoundVoting`, znajdź:

```tsx
      <main className="min-h-0 flex-1 px-[22px] pb-[18px]">
        <div className="relative h-full">
          <SwipeCard key={currentGame.steamAppId} game={currentGame} onSwipe={handleSwipe} />
        </div>
      </main>
```

Zamień na:

```tsx
      <main className="min-h-0 flex-1 px-[22px] pb-[18px]">
        <GameDetailLayout game={currentGame}>
          <SwipeCard key={currentGame.steamAppId} game={currentGame} onSwipe={handleSwipe} />
        </GameDetailLayout>
      </main>
```

**Uwaga:** `currentGame` w tym pliku ma typ `PoolGame` (z `gameByAppId.get(myDeck[0])`, gdzie `PoolGame` rozszerza `SwipeGame` polami pokoju typu `addedBy`/`status`/`playedAt` -- patrz `src/lib/rooms.ts`). `PoolGame` musi mieć te same nowe pola co `SwipeGame` (już dodane w Task 2 Step 3, `src/lib/rooms.ts`) -- jeśli build w tym kroku pokazuje błąd typu "Property X missing on PoolGame", to znaczy że Task 2 Step 3 nie objął wszystkich miejsc budujących `PoolGame`; znajdź brakujące miejsce przez komunikat błędu i dodaj pola tam.

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów

- [ ] **Step 4: Ręczna weryfikacja end-to-end w trybie pokoju**

Run: `npm run dev`, stwórz pokój, dodaj co najmniej 2 gry do puli (przez `/room/[code]/pool`), przejdź do `/room/[code]/swipe`. Potwierdź: karta + panele widoczne (desktop 3 kolumny, telefon chipsy), gest swipe wciąż działa (runda się kończy, zwycięzca się pokazuje jak wcześniej).

- [ ] **Step 5: Commit**

```bash
git add src/components/room/SwipeScreen.tsx
git commit -m "feat: podlacz GameDetailLayout w trybie pokoju"
```

---

## Task 11: Rozszerz walidację `firestore.rules` dla `steam_cache`

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Rozszerz `hasOnly` i walidację typów**

W `firestore.rules`, znajdź blok `match /steam_cache/{steamAppId}` i zamień:

```
      allow write: if request.resource.data.keys().hasOnly([
          'name', 'headerImageUrl', 'steamUrl', 'shortDescription',
          'reviewSummary', 'reviewScorePercent', 'tags',
          'minRequirements', 'recRequirements', 'cachedAt',
        ])
        && request.resource.data.name is string
        && request.resource.data.headerImageUrl is string
        && request.resource.data.steamUrl is string
        && request.resource.data.shortDescription is string
        && request.resource.data.reviewSummary is string
        && request.resource.data.reviewScorePercent is number
        && request.resource.data.tags is list
        && request.resource.data.minRequirements is string
        && request.resource.data.recRequirements is string
        && request.resource.data.cachedAt is number;
```

na:

```
      allow write: if request.resource.data.keys().hasOnly([
          'name', 'headerImageUrl', 'steamUrl', 'shortDescription',
          'reviewSummary', 'reviewScorePercent', 'tags',
          'minRequirements', 'recRequirements', 'cachedAt',
          'developers', 'releaseDate', 'screenshots',
          'trailerHlsUrl', 'trailerThumbnail', 'totalReviews',
        ])
        && request.resource.data.name is string
        && request.resource.data.headerImageUrl is string
        && request.resource.data.steamUrl is string
        && request.resource.data.shortDescription is string
        && request.resource.data.reviewSummary is string
        && request.resource.data.reviewScorePercent is number
        && request.resource.data.tags is list
        && request.resource.data.minRequirements is string
        && request.resource.data.recRequirements is string
        && request.resource.data.cachedAt is number
        && request.resource.data.developers is list
        && (request.resource.data.releaseDate == null || request.resource.data.releaseDate is map)
        && request.resource.data.screenshots is list
        && (request.resource.data.trailerHlsUrl == null || request.resource.data.trailerHlsUrl is string)
        && (request.resource.data.trailerThumbnail == null || request.resource.data.trailerThumbnail is string)
        && request.resource.data.totalReviews is number;
```

- [ ] **Step 2: Wdróż reguły na produkcję**

Run: `firebase deploy --only firestore:rules`
Expected: "Deploy complete!", reguły skompilowane bez błędów

- [ ] **Step 3: Zweryfikuj na żywo**

Ręcznie (`npm run dev`, wskazujący na produkcyjny Firestore jak reszta apki): wczytaj bibliotekę solo, przeglądnij kilka gier na ekranie swipe (co wywołuje `/api/steam/details` i zapis do `steam_cache`), potwierdź brak błędów `PERMISSION_DENIED` w konsoli przeglądarki.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat: rozszerz firestore.rules o nowe pola steam_cache"
```

---

## Task 12: Pełna ręczna weryfikacja end-to-end

- [ ] **Step 1: `npm run build && npx vitest run`**

Expected: build bez błędów, wszystkie testy zielone (stare + nowe z Task 1 i 3).

- [ ] **Step 2: Desktop, gra nadchodząca**

Znajdź w Steam (przez wyszukiwarkę w `/pool` albo `SoloSettingsScreen`) grę z `coming_soon: true` (np. dowolna zapowiedziana gra ze strony głównej Steam). Dodaj ją do puli/biblioteki, otwórz na ekranie swipe w szerokim oknie przeglądarki (>1024px). Potwierdź: 3 kolumny widoczne, prawy panel pokazuje "Przed premierą" z liczbą dni i linkiem do listy życzeń, lewy panel (jeśli gra ma trailer/screenshoty) pokazuje je, trailer się odtwarza po kliknięciu play.

- [ ] **Step 3: Desktop, gra wydana**

Ta sama gra co zwykle (np. Hades, appid 1145360) na szerokim oknie. Potwierdź: prawy panel pokazuje "Opinie Steam" z procentem, opisem i liczbą recenzji.

- [ ] **Step 4: Telefon (wąskie okno, <1024px)**

Ta sama gra. Potwierdź: karta widoczna od razu (swipe działa), chipsy "Media"/"Info" nad kartą, kliknięcie rozwija odpowiedni panel nie zasłaniając karty na stałe (można go zwinąć klikając ponownie).

- [ ] **Step 5: Tryb pokoju**

Powtórz Step 2-4 wewnątrz `/room/[code]/swipe` z co najmniej 2 grami w puli i 2 symulowanymi uczestnikami (jak w poprzednich fazach -- 2 karty przeglądarki albo zwykłe + incognito).

- [ ] **Step 6: Konsola bez błędów**

Sprawdź konsolę przeglądarki (DevTools) na każdym z powyższych kroków -- zero błędów JS, zero `PERMISSION_DENIED` z Firestore, zero 404 z `next/image` (domeny screenshotów muszą być w `next.config.ts`, patrz Task 5 Step 2).

## Self-Review Checklist

1. **Pokrycie spec sekcji**: warstwa danych (Task 1-2), layout (Task 8-10), MediaPanel (Task 5, HlsVideo Task 4), ReleaseOrReviewsPanel (Task 6), przeprojektowana karta z opisem (Task 7), firestore.rules (Task 11), testy czystej funkcji (Task 3), ręczna weryfikacja (Task 12). Pełne pokrycie.
2. **Brak placeholderów**: każdy krok ma pełny, gotowy do wklejenia kod. `shortDescription` wprowadzone raz w Task 2 razem z resztą pól i użyte od razu w Task 7 -- bez tymczasowego, mylącego stanu pośredniego.
3. **Spójność typów**: `SwipeGame` (Task 2) używane identycznie w `SwipeCard` (Task 7), `MediaPanel`/`ReleaseOrReviewsPanel` (Task 5/6), `GameDetailLayout` (Task 8). `trailerHlsUrl`/`trailerThumbnail` nazwane identycznie we wszystkich taskach (zgodnie z poprawionym specem -- Steam appdetails daje HLS, nie mp4). `daysUntil` sygnatura (Task 3) identyczna w użyciu w `ReleaseOrReviewsPanel` (Task 6). `hasMedia` w `GameDetailLayout` (Task 8) liczony z tych samych pól co warunek `null` w `MediaPanel` (Task 5) -- oba muszą się zgadzać, żeby chip "Media" na telefonie nie pokazywał się dla panelu, który i tak wyrenderuje `null`.
