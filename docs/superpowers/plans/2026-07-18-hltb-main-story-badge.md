# HowLongToBeat Main-Story Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a small "~Nh" badge (HowLongToBeat main-story completion time) on the swipe card cover image, hidden entirely when no confident match exists.

**Architecture:** Add a server-only `src/lib/hltb.ts` wrapper around the `howlongtobeat` npm package. Fetch main-story hours once per game inside the existing `/api/steam/details` route (same request that already builds the `steam_cache/{steamAppId}` document), store it as two new fields on that same document, and thread it through the existing `SwipeGame` type into `SwipeCard.tsx`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Firebase Firestore, Vitest, `howlongtobeat` (new dependency).

## Global Constraints

- Only "Main Story" hours are shown — no Main+Extra, no Completionist (spec).
- No new Firestore collection — `hltbMainStory`/`hltbCachedAt` are new fields on the existing `steam_cache/{steamAppId}` document, same 30-day TTL as the rest of that document (spec).
- No match / any error anywhere in the HLTB path → `hltbMainStory: null` → badge renders nothing. Never throw, never block the Steam data from being saved (spec).
- `howlongtobeat` is used exclusively server-side (`src/lib/hltb.ts`, called only from the API route) — never imported from a `"use client"` file (spec, mirrors `src/lib/steam.ts`'s existing constraint).
- The package's `search()` results are **not** pre-sorted by relevance (verified by reading `howlongtobeat`'s source directly — `HowLongToBeatService.search()` returns entries in whatever order the HLTB API gives them, each carrying a separate `similarity` field computed via Levenshtein distance). Selection must pick the entry with the **highest `similarity`**, not `results[0]`. This corrects an assumption made during brainstorming, caught during planning by reading the actual dependency source rather than trusting docs.

---

### Task 1: `howlongtobeat` dependency + `src/lib/hltb.ts`

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/lib/hltb.ts`
- Test: `src/lib/hltb.test.ts`

**Interfaces:**
- Produces: `pickMainStoryHours(results: HowLongToBeatEntry[]): number | null`, `fetchHltbMainStory(title: string): Promise<number | null>` — used by Task 2 (`/api/steam/details/route.ts`).

- [ ] **Step 1: Install the dependency**

Run: `npm install howlongtobeat`
Expected: `package.json` gains `"howlongtobeat": "^1.8.0"` (or whatever the resolved version is) under `dependencies`; `axios`, `cheerio`, `fast-levenshtein`, `user-agents` appear as transitive deps in `package-lock.json`.

- [ ] **Step 2: Write the failing test**

Create `src/lib/hltb.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickMainStoryHours } from "./hltb";
import type { HowLongToBeatEntry } from "howlongtobeat";

function entry(overrides: Partial<HowLongToBeatEntry>): HowLongToBeatEntry {
  return {
    id: "1",
    name: "Test Game",
    description: "",
    platforms: [],
    imageUrl: "",
    timeLabels: [],
    gameplayMain: 10,
    gameplayMainExtra: 15,
    gameplayCompletionist: 20,
    similarity: 1,
    searchTerm: "test",
    playableOn: [],
    ...overrides,
  } as HowLongToBeatEntry;
}

describe("pickMainStoryHours", () => {
  it("returns null for an empty result list", () => {
    expect(pickMainStoryHours([])).toBeNull();
  });

  it("returns the rounded gameplayMain of the single result", () => {
    expect(pickMainStoryHours([entry({ gameplayMain: 12.4 })])).toBe(12);
  });

  it("picks the entry with the highest similarity, not the first one", () => {
    const results = [
      entry({ name: "Hades II", gameplayMain: 25, similarity: 0.6 }),
      entry({ name: "Hades", gameplayMain: 22, similarity: 0.95 }),
    ];
    expect(pickMainStoryHours(results)).toBe(22);
  });

  it("returns null when the best match has no usable main-story time", () => {
    expect(pickMainStoryHours([entry({ gameplayMain: 0, similarity: 1 })])).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/hltb.test.ts`
Expected: FAIL — `./hltb` has no exported member `pickMainStoryHours` (module doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `src/lib/hltb.ts`:

```ts
/** Wywołania nieoficjalnego pakietu npm `howlongtobeat`. Tylko server-side --
 * pakiet zależy od cheerio/axios (scraping HTML), nigdy nie trafia do bundla
 * klienta. HLTB, w przeciwieństwie do Steama, nie ma stabilnego publicznego
 * endpointu (bezpośrednie uderzenie w /api/search dało 404, strona haszuje
 * chunki JS) -- stąd gotowy, utrzymywany pakiet zamiast własnego scrapera.
 * Uzasadnienie: docs/superpowers/specs/2026-07-18-hltb-main-story-badge-design.md */
import { HowLongToBeatService, type HowLongToBeatEntry } from "howlongtobeat";

/** Czysta funkcja wyboru -- testowalna bez sieci, wzorzec jak
 * parseSteamAppDetails w steam.ts. UWAGA: search() pakietu NIE sortuje po
 * trafności -- każdy wynik niesie własne pole `similarity` (Levenshtein),
 * trzeba samemu wybrać najlepszy, nie brać results[0]. */
export function pickMainStoryHours(results: HowLongToBeatEntry[]): number | null {
  if (results.length === 0) return null;
  const best = results.reduce((a, b) => (b.similarity > a.similarity ? b : a));
  if (!best.gameplayMain || best.gameplayMain <= 0) return null;
  return Math.round(best.gameplayMain);
}

/** Nigdy nie rzuca -- błąd sieci/parsowania degraduje do null, tak samo jak
 * brak wyników. Wołane z /api/steam/details, nigdy nie blokuje zapisania
 * świeżych danych Steama. */
export async function fetchHltbMainStory(title: string): Promise<number | null> {
  try {
    const service = new HowLongToBeatService();
    const results = await service.search(title);
    return pickMainStoryHours(results);
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/hltb.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/hltb.ts src/lib/hltb.test.ts
git commit -m "feat: add HowLongToBeat lookup (pickMainStoryHours + fetchHltbMainStory)"
```

---

### Task 2: Cache HLTB data on `steam_cache` via `/api/steam/details`

**Files:**
- Modify: `src/lib/steam.ts` (add fields to `SteamCacheEntry`)
- Modify: `src/app/api/steam/details/route.ts`

**Interfaces:**
- Consumes: `fetchHltbMainStory` from `@/lib/hltb` (Task 1).
- Produces: `SteamCacheEntry.hltbMainStory: number | null`, `SteamCacheEntry.hltbCachedAt: number | null` — used by Task 3 (`SwipeGame` + construction sites).

- [ ] **Step 1: Extend `SteamCacheEntry`**

In `src/lib/steam.ts`, modify the `SteamCacheEntry` type (currently ends with `topReviews: { author: string; text: string; votedUp: boolean }[];` before its closing `};`):

```ts
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
  hltbMainStory: number | null;
  hltbCachedAt: number | null;
};
```

Do **not** add these fields inside `parseSteamAppDetails` — that function only parses the Steam API response and stays untouched. HLTB is a separate network call, set by the route in the next step.

- [ ] **Step 2: Run the existing steam tests to confirm nothing broke**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: PASS. (`parseSteamAppDetails`'s return object is missing the two new required fields now, which TypeScript would normally flag — but the test calls the function directly and only asserts on individual fields via `result.xxx`, so this compiles and passes. The route, not the parser, is responsible for filling `hltbMainStory`/`hltbCachedAt` before writing to Firestore, per Step 4.)

- [ ] **Step 3: Update the route's cache-completeness gate**

In `src/app/api/steam/details/route.ts`, the current freshness check is:

```ts
const isFresh = Date.now() - data.cachedAt < CACHE_TTL_MS;
const hasMediaFields = Object.prototype.hasOwnProperty.call(data, "screenshots");
if (isFresh && hasMediaFields) {
  return NextResponse.json({ steamAppId, ...data });
}
```

Replace with:

```ts
const isFresh = Date.now() - data.cachedAt < CACHE_TTL_MS;
const hasMediaFields = Object.prototype.hasOwnProperty.call(data, "screenshots");
const hasHltbField = Object.prototype.hasOwnProperty.call(data, "hltbMainStory");
if (isFresh && hasMediaFields && hasHltbField) {
  return NextResponse.json({ steamAppId, ...data });
}
```

- [ ] **Step 4: Fetch and store HLTB data on refresh**

Replace the refetch block:

```ts
const fresh = await fetchSteamGameDetails(steamAppId);
await setDoc(cacheRef, fresh);
return NextResponse.json({ steamAppId, ...fresh });
```

with:

```ts
const fresh = await fetchSteamGameDetails(steamAppId);
// Sekwencyjnie, nie równolegle: fetchHltbMainStory potrzebuje tytułu, który
// dopiero co zwrócił fetchSteamGameDetails. HLTB nigdy nie rzuca (zob. hltb.ts),
// więc błąd/brak wyniku tutaj nigdy nie blokuje zapisania danych Steama.
const hltbMainStory = await fetchHltbMainStory(fresh.name);
const withHltb: SteamCacheEntry = { ...fresh, hltbMainStory, hltbCachedAt: Date.now() };
await setDoc(cacheRef, withHltb);
return NextResponse.json({ steamAppId, ...withHltb });
```

Add the import at the top of the file:

```ts
import { fetchHltbMainStory } from "@/lib/hltb";
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/steam.ts src/app/api/steam/details/route.ts
git commit -m "feat: cache HowLongToBeat main-story hours on steam_cache"
```

---

### Task 3: Thread `hltbMainStory` through `SwipeGame`

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/components/solo/SoloSwipeScreen.tsx:16-33` (the local `DetailsResponse` type) and `:122-138` (the `setCurrentCard({...})` object literal)
- Modify: `src/components/room/RoomExploreScreen.tsx:44-61` (the `toSwipeGame` function)
- Modify: `src/components/solo/SoloLikedScreen.tsx:13-30` (the `toSwipeGame` function)

**Interfaces:**
- Consumes: `SteamCacheEntry.hltbMainStory` (Task 2).
- Produces: `SwipeGame.hltbMainStory: number | null` — used by Task 4 (`SwipeCard.tsx`).

- [ ] **Step 1: Extend `SwipeGame`**

In `src/lib/types.ts`, add the field at the end of the type (after `topReviews`):

```ts
export type SwipeGame = {
  steamAppId: number;
  title: string;
  coverImageUrl?: string;
  tags: string[];
  genres: string[];
  reviewScorePercent: number;
  reviewSummary: string;
  shortDescription: string;
  developers: string[];
  releaseDate: { comingSoon: boolean; date: string } | null;
  screenshots: string[];
  trailerHlsUrl: string | null;
  trailerThumbnail: string | null;
  totalReviews: number;
  topReviews: { author: string; text: string; votedUp: boolean }[];
  hltbMainStory: number | null;
};
```

- [ ] **Step 2: `SoloSwipeScreen.tsx` — local `DetailsResponse` type**

Add the field to the local type (this file does not import `SteamCacheEntry`, it has its own copy — leave that as-is, just extend it):

```ts
type DetailsResponse = {
  steamAppId: number;
  name: string;
  headerImageUrl: string;
  tags: string[];
  genres: string[];
  reviewScorePercent: number;
  reviewSummary: string;
  shortDescription: string;
  developers: string[];
  releaseDate: { comingSoon: boolean; date: string } | null;
  screenshots: string[];
  trailerHlsUrl: string | null;
  trailerThumbnail: string | null;
  totalReviews: number;
  topReviews: { author: string; text: string; votedUp: boolean }[];
  hltbMainStory: number | null;
  error?: string;
};
```

- [ ] **Step 3: `SoloSwipeScreen.tsx` — object literal**

In the `setCurrentCard({...})` call, add the field after `topReviews`:

```ts
        setCurrentCard({
          steamAppId: data.steamAppId,
          title: data.name,
          coverImageUrl: data.headerImageUrl,
          tags,
          genres,
          reviewScorePercent: data.reviewScorePercent,
          reviewSummary: data.reviewSummary,
          shortDescription: data.shortDescription,
          developers: data.developers ?? [],
          releaseDate: data.releaseDate,
          screenshots: data.screenshots ?? [],
          trailerHlsUrl: data.trailerHlsUrl,
          trailerThumbnail: data.trailerThumbnail,
          totalReviews: data.totalReviews ?? 0,
          topReviews: data.topReviews ?? [],
          hltbMainStory: data.hltbMainStory ?? null,
        });
```

- [ ] **Step 4: `RoomExploreScreen.tsx` — `toSwipeGame`**

In the `toSwipeGame` function, add the field after `topReviews`:

```ts
function toSwipeGame(data: DetailsResponse): SwipeGame {
  return {
    steamAppId: data.steamAppId,
    title: data.name,
    coverImageUrl: data.headerImageUrl,
    tags: data.tags ?? [],
    genres: data.genres ?? [],
    reviewScorePercent: data.reviewScorePercent,
    reviewSummary: data.reviewSummary,
    shortDescription: data.shortDescription,
    developers: data.developers ?? [],
    releaseDate: data.releaseDate,
    screenshots: data.screenshots ?? [],
    trailerHlsUrl: data.trailerHlsUrl,
    trailerThumbnail: data.trailerThumbnail,
    totalReviews: data.totalReviews ?? 0,
    topReviews: data.topReviews ?? [],
    hltbMainStory: data.hltbMainStory ?? null,
  };
}
```

(`DetailsResponse` in this file is `SteamCacheEntry & { steamAppId: number; error?: string }` — it already inherits `hltbMainStory` from Task 2's change to `SteamCacheEntry`, no separate type edit needed here.)

- [ ] **Step 5: `SoloLikedScreen.tsx` — `toSwipeGame`**

Same change as Step 4, in this file's identical `toSwipeGame` function:

```ts
function toSwipeGame(data: DetailsResponse): SwipeGame {
  return {
    steamAppId: data.steamAppId,
    title: data.name,
    coverImageUrl: data.headerImageUrl,
    tags: data.tags ?? [],
    genres: data.genres ?? [],
    reviewScorePercent: data.reviewScorePercent,
    reviewSummary: data.reviewSummary,
    shortDescription: data.shortDescription,
    developers: data.developers ?? [],
    releaseDate: data.releaseDate,
    screenshots: data.screenshots ?? [],
    trailerHlsUrl: data.trailerHlsUrl,
    trailerThumbnail: data.trailerThumbnail,
    totalReviews: data.totalReviews ?? 0,
    topReviews: data.topReviews ?? [],
    hltbMainStory: data.hltbMainStory ?? null,
  };
}
```

(Same reasoning: `DetailsResponse` here is also `SteamCacheEntry & {...}`, already inherits the field.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (This step is the real verification for this task — `SwipeGame` gaining a required field would break every object literal that builds one, so a clean typecheck confirms all three construction sites were actually updated. If it fails, TypeScript's error will point at any construction site missed above.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/components/solo/SoloSwipeScreen.tsx src/components/room/RoomExploreScreen.tsx src/components/solo/SoloLikedScreen.tsx
git commit -m "feat: thread hltbMainStory through SwipeGame"
```

---

### Task 4: Badge on `SwipeCard`

**Files:**
- Modify: `src/components/swipe/SwipeCard.tsx`

**Interfaces:**
- Consumes: `SwipeGame.hltbMainStory` (Task 3).

- [ ] **Step 1: Add the `Clock` icon import**

In `src/components/swipe/SwipeCard.tsx`, extend the existing `lucide-react` import:

```tsx
import { Clock, ExternalLink } from "lucide-react";
```

- [ ] **Step 2: Render the badge**

In the cover-image container (currently):

```tsx
      <div className="relative mx-auto mt-5 aspect-[3/4] w-3/5 shrink-0 overflow-hidden rounded-xl lg:w-2/5 lg:max-h-[38%]">
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
```

add the badge as a sibling of the conditional image/placeholder block, right before the closing `</div>`:

```tsx
      <div className="relative mx-auto mt-5 aspect-[3/4] w-3/5 shrink-0 overflow-hidden rounded-xl lg:w-2/5 lg:max-h-[38%]">
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
        {game.hltbMainStory != null && (
          <div className="bg-card/90 absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
            <Clock className="h-3 w-3" />
            ~{game.hltbMainStory}h
          </div>
        )}
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: all tests pass (existing suite + Task 1's new `hltb.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/components/swipe/SwipeCard.tsx
git commit -m "feat: show HowLongToBeat main-story badge on swipe card"
```

---

### Task 5: Manual verification (Playwright)

No code changes — confirms the feature actually works end-to-end against the real HLTB service, per this project's convention of verifying external-API/UI flows manually rather than with automated integration tests.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background)

- [ ] **Step 2: Verify a well-known game shows a sensible badge**

Using Playwright (or manually in a browser): go through Solo → Eksploruj katalog, swipe until a well-known, popular game appears (e.g. search/browse to something like Hades, Stardew Valley, or Portal 2 — any title with an unambiguous, well-populated HLTB entry). Confirm:
- A pill with a clock icon and `~Nh` appears in the bottom-right corner of the cover image.
- The number is plausible for that game (sanity check against known completion time, not an exact assertion).

- [ ] **Step 3: Verify silent degradation**

Find or use a very new/niche game unlikely to have HLTB data (or temporarily break the query — e.g. check a game added the same week — to observe the null path). Confirm:
- No badge renders.
- No console error, no broken layout, no crash.

- [ ] **Step 4: Verify cache persistence**

Reload the same well-known game's card a second time (e.g. via the room "Szczegóły na Steam" flow, or swipe back through history) within the same session. Confirm the badge appears instantly (served from `steam_cache`, no visible delay from a second HLTB network round-trip) — open browser devtools Network tab and confirm no request to `howlongtobeat.com` fires for a game already cached.

- [ ] **Step 5: Report result**

If any step fails, note the exact console/Firestore error and fix before considering this plan complete. If all steps pass, this plan is done — no commit needed for this task (verification only).

---

## Self-Review Notes

- **Spec coverage:** Task 1 = `pickMainStoryHours`/`fetchHltbMainStory` (spec's "Nowy moduł hltb.ts"). Task 2 = `SteamCacheEntry` fields + route caching (spec's "Zmiana w steam.ts" + "Zmiana w route"). Task 3 = `SwipeGame` + all three construction sites (spec's "Zmiana w types.ts i miejscach budujących SwipeGame" — the plan enumerates the exact files the spec deferred to planning). Task 4 = badge UI (spec's "Zmiana w SwipeCard.tsx"). Task 5 = manual verification (spec's stated test strategy). All spec sections covered; none of the spec's "Świadomie poza zakresem" items appear in any task.
- **Placeholder scan:** none found — every step has complete code.
- **Type consistency:** `hltbMainStory: number | null` used identically across `SteamCacheEntry` (Task 2), `SwipeGame` (Task 3), and the `SwipeCard` prop consumption (Task 4). `pickMainStoryHours(results: HowLongToBeatEntry[]): number | null` (Task 1) matches its only call site inside `fetchHltbMainStory` in the same file.
- **Correction caught during planning (not in the original spec):** the spec assumed the `howlongtobeat` package's `search()` returns results pre-sorted by relevance ("pakiet już sortuje wyniki po trafności, bierzemy pierwszy"). Reading the package's actual source (`src/main/howlongtobeat.ts` on GitHub) showed `search()` does no sorting — each result carries its own `similarity` field, and the caller must pick the best one. Task 1's `pickMainStoryHours` and its test (`"picks the entry with the highest similarity, not the first one"`) implement the corrected behavior; the Global Constraints section documents why.
