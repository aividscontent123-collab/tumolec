# Swipe Screen Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the stale-media-cache bug, add a review-score color gradient, fix header overlap + show a live liked-count in the room, and generalize the swipe screen's genre-only filter bar into a full tag filter bar (pinned Kooperacja/Multiplayer/Nowości/Wkrótce, more popular tags, and a search box over the full 432-tag Steam catalog).

**Architecture:** Four independent slices sharing one underlying insight from Task 6: `matchesGenreFilter` (renamed `matchesTagFilter`) is already a generic string-array matcher — filtering on `game.tags` instead of `game.genres` needs no new matching logic, only a field swap at two call sites. The tag filter bar keeps its existing flat `string[]` public API; two sentinel string constants (`NEW_RELEASE_TAG`, `UPCOMING_TAG`) let it render date-based pills with the same toggle mechanics as real tags, and the two consuming screens strip and interpret those sentinels separately from real tag matching.

**Tech Stack:** Next.js 16, TypeScript, Tailwind, Firebase Firestore, Vitest, `lucide-react`.

## Global Constraints

- `npm run build` and `npx vitest run` must pass after every task (repo convention).
- No new npm dependencies.
- Client-side matching (`matchesTagFilter`, `isRecentRelease`, `isUpcomingSoon`) remains the correctness backstop for every candidate source — server-side Steam tag IDs (`resolveSteamTagId`) are a relevance optimization only.
- `rooms/{roomCode}/session/state` writes must always use `setDoc(..., { merge: true })` on a single field — never the whole document.
- Commit after every task, Polish commit messages, lowercase type prefix (`feat:`, `fix:`, `refactor:`), matching existing `git log` style.

---

## Task 1: Fix stale media cache detection

**Files:**
- Modify: `src/app/api/steam/details/route.ts`

**Interfaces:** No signature changes — same `GET` handler, same response shape.

- [ ] **Step 1: Add a schema-completeness check to the cache freshness condition**

Replace:
```ts
  try {
    const cached = await getDoc(cacheRef);
    if (cached.exists()) {
      const data = cached.data() as SteamCacheEntry;
      if (Date.now() - data.cachedAt < CACHE_TTL_MS) {
        return NextResponse.json({ steamAppId, ...data });
      }
    }
```
with:
```ts
  try {
    const cached = await getDoc(cacheRef);
    if (cached.exists()) {
      const data = cached.data() as SteamCacheEntry;
      // Wpisy sprzed dodania pola screenshots/trailerHlsUrl (commit 110bd72,
      // 2026-07-14) nie mają go wcale w dokumencie -- wiek sam w sobie nie
      // wystarczy, żeby uznać cache za kompletny. Wymuś refetch natychmiast
      // zamiast czekać do 30-dniowego TTL.
      const isFresh = Date.now() - data.cachedAt < CACHE_TTL_MS;
      const hasMediaFields = Object.prototype.hasOwnProperty.call(data, "screenshots");
      if (isFresh && hasMediaFields) {
        return NextResponse.json({ steamAppId, ...data });
      }
    }
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification against a known-stale entry**

Run `npm run dev`, then:
```bash
curl -s "http://localhost:3000/api/steam/details?appid=100" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('screenshots:',j.screenshots?.length,'trailerHlsUrl:',j.trailerHlsUrl)})"
```
Expected: `screenshots` is a populated array (not `undefined`/`0` from a stale cache hit) — appid 100 (Counter-Strike: Condition Zero) was confirmed stale during investigation (cached 2026-07-14, missing both fields). A non-empty result confirms the refetch path fired.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/steam/details/route.ts
git commit -m "fix: wymus refetch cache steam_cache przy brakujacych polach mediow (screenshots/trailer)"
```

---

## Task 2: Review score color gradient

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/lib/reviewScore.ts`
- Create: `src/lib/reviewScore.test.ts`
- Modify: `src/components/swipe/ReleaseOrReviewsPanel.tsx`
- Modify: `src/components/room/GamePoolList.tsx`

**Interfaces:**
- Produces: `reviewScoreColorClass(percent: number): string` — returns one of `"text-pass"` / `"text-rating-mid"` / `"text-rating"`.

- [ ] **Step 1: Add the new CSS token**

In `src/app/globals.css`, add to the `@theme inline` block (near line 18, alongside `--color-rating`):
```css
  --color-rating-mid: var(--rating-mid);
```

Add to the `:root` block (light theme, near line 102, alongside `--rating`):
```css
  --rating-mid: oklch(0.65 0.16 85);
```

Add to the `.dark` block (near line 113, alongside `--rating`):
```css
  --rating-mid: oklch(0.8 0.14 85);
```

(Note: `:root` without `.dark` is the LIGHT theme in this file — confirmed by reading the surrounding block; `.dark` overrides for the dark theme, which is the app's default via a `.dark` class added before hydration.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/reviewScore.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { reviewScoreColorClass } from "./reviewScore";

describe("reviewScoreColorClass", () => {
  it("returns the negative color below 40%", () => {
    expect(reviewScoreColorClass(0)).toBe("text-pass");
    expect(reviewScoreColorClass(39)).toBe("text-pass");
  });

  it("returns the mid color for 40-69%", () => {
    expect(reviewScoreColorClass(40)).toBe("text-rating-mid");
    expect(reviewScoreColorClass(69)).toBe("text-rating-mid");
  });

  it("returns the positive color at 70% and above", () => {
    expect(reviewScoreColorClass(70)).toBe("text-rating");
    expect(reviewScoreColorClass(100)).toBe("text-rating");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/reviewScore.test.ts`
Expected: FAIL — `./reviewScore` module not found.

- [ ] **Step 4: Implement**

Create `src/lib/reviewScore.ts`:
```ts
/** Progi pokrywają się z własną kategoryzacją opinii Steama (Mixed = 40-69%,
 * Positive+ = 70%+), żeby kolor był zgodny z intuicją graczy przyzwyczajonych
 * do Steama. `text-pass`/`text-rating` reużyte z istniejących tokenów (te
 * same kolory co reszta apki dla "źle"/"dobrze"); `text-rating-mid` to nowy
 * token tylko dla tego przypadku. */
export function reviewScoreColorClass(percent: number): string {
  if (percent < 40) return "text-pass";
  if (percent < 70) return "text-rating-mid";
  return "text-rating";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/reviewScore.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 6: Wire into `ReleaseOrReviewsPanel.tsx`**

Add the import:
```tsx
import { daysUntil } from "@/lib/releaseCountdown";
import type { SwipeGame } from "@/lib/types";
```
becomes:
```tsx
import { daysUntil } from "@/lib/releaseCountdown";
import { reviewScoreColorClass } from "@/lib/reviewScore";
import type { SwipeGame } from "@/lib/types";
```

Replace:
```tsx
        <div className="font-heading text-rating text-2xl font-bold">{game.reviewScorePercent}%</div>
```
with:
```tsx
        <div className={`font-heading text-2xl font-bold ${reviewScoreColorClass(game.reviewScorePercent)}`}>
          {game.reviewScorePercent}%
        </div>
```

(`ThumbsUp`/`ThumbsDown` a few lines below stay untouched — they indicate a single review's up/down vote, not a percent.)

- [ ] **Step 7: Wire into `GamePoolList.tsx`**

Add the import:
```tsx
import Image from "next/image";
import type { PoolGame } from "@/lib/rooms";
import { setGameStatus } from "@/lib/rooms";
```
becomes:
```tsx
import Image from "next/image";
import type { PoolGame } from "@/lib/rooms";
import { setGameStatus } from "@/lib/rooms";
import { reviewScoreColorClass } from "@/lib/reviewScore";
```

Replace:
```tsx
            <p className="text-rating text-xs">
              {game.reviewScorePercent}% {game.reviewSummary}
            </p>
```
with:
```tsx
            <p className={`text-xs ${reviewScoreColorClass(game.reviewScorePercent)}`}>
              {game.reviewScorePercent}% {game.reviewSummary}
            </p>
```

- [ ] **Step 8: Build to verify**

Run: `npm run build`
Expected: succeeds — confirms the new Tailwind class `text-rating-mid` resolves (it will, since `--color-rating-mid` is now registered in the `@theme inline` block, matching the existing `text-rating`/`text-pass` pattern).

- [ ] **Step 9: Manual verification**

`npm run dev`, open a swipe screen. Confirm: a well-reviewed game (≥70%) shows green percent, a mixed one (40-69%) shows yellow, a poorly-reviewed one (<40%) shows red — same in `ReleaseOrReviewsPanel` and in the room pool list (`/room/[code]/pool`). Confirm confetti (`WinnerScreen`), the swipe-right "GRAMY" badge (`SwipeCard`), and the thumbs-up icon on individual reviews are all still their original fixed green — unaffected by this change.

- [ ] **Step 10: Commit**

```bash
git add src/app/globals.css src/lib/reviewScore.ts src/lib/reviewScore.test.ts src/components/swipe/ReleaseOrReviewsPanel.tsx src/components/room/GamePoolList.tsx
git commit -m "feat: gradient kolorow procentu opinii (czerwony/zolty/zielony wg progow Steama)"
```

---

## Task 3: Header spacing + room liked-count badge

**Files:**
- Modify: `src/components/solo/SoloSwipeScreen.tsx`
- Modify: `src/components/room/RoomExploreScreen.tsx`

**Interfaces:** No prop/signature changes.

- [ ] **Step 1: Fix header overlap in `SoloSwipeScreen.tsx`**

Replace:
```tsx
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
```
with:
```tsx
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3 pr-12">
        <button
          type="button"
          onClick={onExit}
```

(`pr-12` = 48px, clears the fixed `ThemeToggle` — 36px button + 12px offset from the viewport edge — so the rightmost header element never sits underneath it.)

- [ ] **Step 2: Fix header overlap + add liked count in `RoomExploreScreen.tsx`**

Add the import:
```tsx
import {
  subscribeToParticipants,
  likeGame,
  setExploreGenreFilter,
  subscribeToExploreGenreFilter,
  type Participant,
} from "@/lib/rooms";
```
becomes:
```tsx
import {
  subscribeToParticipants,
  likeGame,
  setExploreGenreFilter,
  subscribeToExploreGenreFilter,
  subscribeToLiked,
  type Participant,
} from "@/lib/rooms";
```

Add state and a subscription effect. Replace:
```tsx
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("multi");
  const [genres, setGenres] = useState<string[]>([]);
  const [source, setSource] = useState<"shared" | "catalog">("shared");
```
with:
```tsx
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("multi");
  const [genres, setGenres] = useState<string[]>([]);
  const [source, setSource] = useState<"shared" | "catalog">("shared");
  const [likedCount, setLikedCount] = useState(0);
```

Replace:
```tsx
  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);
  // Filtr gatunku żyje w rooms/{roomCode}/session/state -- każdy gracz
  // subskrybuje na żywo i może pisać, zob. Task 2 (rooms.ts).
  useEffect(() => subscribeToExploreGenreFilter(roomCode, setGenres), [roomCode]);
```
with:
```tsx
  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);
  // Filtr gatunku żyje w rooms/{roomCode}/session/state -- każdy gracz
  // subskrybuje na żywo i może pisać, zob. Task 2 (rooms.ts).
  useEffect(() => subscribeToExploreGenreFilter(roomCode, setGenres), [roomCode]);
  useEffect(() => subscribeToLiked(roomCode, (games) => setLikedCount(games.length)), [roomCode]);
```

Fix the header row's overlap and add the count. Replace:
```tsx
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setStarted(false)}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <Link href={`/room/${roomCode}/liked`} className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground">
          ❤️ Polubione
        </Link>
      </div>
```
with:
```tsx
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3 pr-12">
        <button
          type="button"
          onClick={() => setStarted(false)}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <Link href={`/room/${roomCode}/liked`} className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground">
          ❤️ {likedCount}
        </Link>
      </div>
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

`npm run dev`, resize the browser to a narrow (mobile) width. Confirm the header's rightmost button no longer sits under the fixed theme-toggle circle in either `SoloSwipeScreen` or `RoomExploreScreen`. In a room, like a couple of games and confirm the "❤️ N" count updates live without navigating to the Liked screen.

- [ ] **Step 5: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx src/components/room/RoomExploreScreen.tsx
git commit -m "fix: odstep naglowka od przelacznika motywu, licznik Polubionych w pokoju"
```

---

## Task 4: Full Steam tag catalog + `resolveSteamTagId`

**Files:**
- Create: `src/lib/steamTagCatalog.ts`
- Modify: `src/lib/steam.ts`
- Modify: `src/app/api/steam/discover/route.ts`

**Interfaces:**
- Produces: `STEAM_TAG_CATALOG: { id: number; name: string }[]` (432 entries), `resolveSteamTagId(filterValue: string): number | undefined`.
- Removes: `GENRE_TAG_IDS` (replaced by `resolveSteamTagId`, which subsumes it).

Verified live 2026-07-16/17 against `GET https://store.steampowered.com/tagdata/populartags/polish` (the same official endpoint already used to verify the original 8 genre IDs) — 432 total tags. One entry (`14139`) has a stray leading space in its raw name (`" Taktyczne turowe"`) — trimmed below, a genuine upstream data quirk, not a transcription error.

- [ ] **Step 1: Create the tag catalog data file**

Create `src/lib/steamTagCatalog.ts`:
```ts
/** Pełna oficjalna lista tagów Steam (GET https://store.steampowered.com/tagdata/populartags/polish,
 * zweryfikowana na żywo 2026-07-16/17). Kolejność = własna kolejność Steama z tego endpointu
 * (nazwa sugeruje sortowanie po popularności -- ufamy jej zamiast ręcznie kurować). Używane
 * przez wyszukiwarkę tagów w TagFilterBar i przez resolveSteamTagId (poniżej w steam.ts). */
export const STEAM_TAG_CATALOG: { id: number; name: string }[] = [
  { id: 492, name: "Niezależne" },
  { id: 19, name: "Akcja" },
  { id: 21, name: "Przygodowe" },
  { id: 597, name: "Rekreacyjne" },
  { id: 4182, name: "Jednoosobowe" },
  { id: 599, name: "Symulatory" },
  { id: 122, name: "RPG" },
  { id: 9, name: "Strategiczne" },
  { id: 3871, name: "2D" },
  { id: 493, name: "Wczesny dostęp" },
  { id: 4191, name: "3D" },
  { id: 113, name: "Free to Play" },
  { id: 4166, name: "Klimatyczne" },
  { id: 1742, name: "Bogata fabuła" },
  { id: 4305, name: "Kolorowe" },
  { id: 3834, name: "Eksploracja" },
  { id: 1684, name: "Fantasy" },
  { id: 3859, name: "Wieloosobowe" },
  { id: 4726, name: "Urocze" },
  { id: 3964, name: "Pikselowa grafika" },
  { id: 3993, name: "Walka" },
  { id: 1664, name: "Łamigłówki" },
  { id: 3839, name: "Perspektywa pierwszej osoby" },
  { id: 1654, name: "Relaksujące" },
  { id: 4106, name: "Przygodowe akcji" },
  { id: 4252, name: "Stylizowane" },
  { id: 4136, name: "Zabawne" },
  { id: 1773, name: "Zręcznościowe" },
  { id: 7481, name: "Kontroler" },
  { id: 4085, name: "Anime" },
  { id: 1667, name: "Horror" },
  { id: 6730, name: "PvE" },
  { id: 3942, name: "Science fiction" },
  { id: 701, name: "Sportowe" },
  { id: 1685, name: "Kooperacja" },
  { id: 128, name: "MMO" },
  { id: 1697, name: "Perspektywa trzeciej osoby" },
  { id: 6426, name: "Znaczące wybory" },
  { id: 4667, name: "Przemoc" },
  { id: 4004, name: "Retro" },
  { id: 1774, name: "Strzelanka" },
  { id: 4791, name: "Widok z góry" },
  { id: 5350, name: "Familijne" },
  { id: 7208, name: "Żeńska postać w roli głównej" },
  { id: 12095, name: "Treści seksualne" },
  { id: 4342, name: "Mroczne" },
  { id: 4175, name: "Realistyczne" },
  { id: 1775, name: "PvP" },
  { id: 699, name: "Wyścigowe" },
  { id: 5716, name: "Tajemnicze" },
  { id: 6650, name: "Nagość" },
  { id: 7250, name: "Liniowe" },
  { id: 1695, name: "Otwarty świat" },
  { id: 6971, name: "Wiele zakończeń" },
  { id: 1662, name: "Survival" },
  { id: 3843, name: "Sieciowa kooperacja" },
  { id: 4747, name: "Dostosowywanie postaci" },
  { id: 1719, name: "Komediowe" },
  { id: 4195, name: "Kreskówkowe" },
  { id: 3799, name: "Powieść wizualna" },
  { id: 3968, name: "Fizyka" },
  { id: 1721, name: "Horror psychologiczny" },
  { id: 4345, name: "Krew" },
  { id: 1625, name: "Platformowe" },
  { id: 4057, name: "Magia" },
  { id: 5379, name: "Platformowe 2D" },
  { id: 1716, name: "Roguelike" },
  { id: 3810, name: "Piaskownica" },
  { id: 3959, name: "Roguelite" },
  { id: 12472, name: "Zarządzanie" },
  { id: 3916, name: "Stara szkoła" },
  { id: 8945, name: "Zarządzanie zasobami" },
  { id: 1708, name: "Taktyczne" },
  { id: 1663, name: "FPS" },
  { id: 4172, name: "Średniowieczne" },
  { id: 6815, name: "Ręcznie rysowane" },
  { id: 4231, name: "RPG akcji" },
  { id: 9204, name: "Wciągający symulator" },
  { id: 4325, name: "Walka turowa" },
  { id: 4094, name: "Minimalistyczne" },
  { id: 1741, name: "Strategiczne turowe" },
  { id: 1702, name: "Wytwarzanie" },
  { id: 4295, name: "Futurystyczne" },
  { id: 1643, name: "Budowanie" },
  { id: 1698, name: "Wskaż i kliknij" },
  { id: 5608, name: "Poruszające" },
  { id: 4604, name: "Mroczne fantasy" },
  { id: 42804, name: "Roguelike akcji" },
  { id: 4562, name: "Kreskówka" },
  { id: 5125, name: "Generacja proceduralna" },
  { id: 1755, name: "Kosmos" },
  { id: 4026, name: "Trudne" },
  { id: 5395, name: "Platformowe 3D" },
  { id: 4947, name: "Romans" },
  { id: 11014, name: "Fikcja interaktywna" },
  { id: 4486, name: "Wybierz własną przygodę" },
  { id: 30358, name: "Natura" },
  { id: 6129, name: "Logiczne" },
  { id: 3978, name: "Survival horror" },
  { id: 14139, name: "Taktyczne turowe" },
  { id: 87, name: "Narzędzia użytkowe" },
  { id: 7368, name: "Lokalny tryb wieloosobowy" },
  { id: 9130, name: "Hentai" },
  { id: 6691, name: "Lata 90." },
  { id: 7332, name: "Budowanie bazy" },
  { id: 1710, name: "Surrealistyczne" },
  { id: 1646, name: "Hack and slash" },
  { id: 9551, name: "Symulator randkowania" },
  { id: 1738, name: "Ukryte przedmioty" },
  { id: 560542, name: "Inkrementacja" },
  { id: 21978, name: "VR" },
  { id: 4885, name: "Bullet hell" },
  { id: 3798, name: "Side-scroller" },
  { id: 3835, name: "Postapokaliptyczne" },
  { id: 17305, name: "Strategiczne RPG" },
  { id: 5537, name: "Łamigłówki platformowe" },
  { id: 1036, name: "Edukacyjne" },
  { id: 5900, name: "Symulator chodzenia" },
  { id: 1720, name: "Dungeon crawler" },
  { id: 3854, name: "Bogate uniwersum" },
  { id: 4145, name: "Filmowe" },
  { id: 17389, name: "Rozgrywane na stole" },
  { id: 10235, name: "Symulator życia" },
  { id: 5154, name: "Gry na punkty" },
  { id: 42152, name: "Rozmowa" },
  { id: 4255, name: "Shoot 'em up" },
  { id: 1678, name: "Wojna" },
  { id: 1666, name: "Gra karciana" },
  { id: 6276, name: "Zarządzanie ekwipunkiem" },
  { id: 31275, name: "Tekstowe" },
  { id: 5186, name: "Psychologiczne" },
  { id: 4695, name: "Gospodarka" },
  { id: 1756, name: "Świetna ścieżka dźwiękowa" },
  { id: 4434, name: "JRPG" },
  { id: 1659, name: "Zombie" },
  { id: 44868, name: "LGBTQ+" },
  { id: 1687, name: "Skradanie" },
  { id: 7743, name: "Lata 80." },
  { id: 84, name: "Projektowanie i ilustrowanie" },
  { id: 615955, name: "Idlery" },
  { id: 8369, name: "Śledztwo" },
  { id: 3841, name: "Lokalna kooperacja" },
  { id: 4975, name: "2,5D" },
  { id: 4064, name: "Thriller" },
  { id: 10695, name: "Drużynowe RPG" },
  { id: 3987, name: "Historyczne" },
  { id: 10808, name: "Zjawiska nadprzyrodzone" },
  { id: 12057, name: "Samouczek" },
  { id: 5851, name: "Izometryczne" },
  { id: 5923, name: "Czarny humor" },
  { id: 6869, name: "Nieliniowe" },
  { id: 32322, name: "Tworzenie talii" },
  { id: 1677, name: "Turowe" },
  { id: 16689, name: "Zarządzanie czasem" },
  { id: 4168, name: "Wojskowe" },
  { id: 4637, name: "Strzelanka z widokiem z góry" },
  { id: 7926, name: "Sztuczna inteligencja" },
  { id: 3814, name: "Strzelanka z perspektywą trzeciej osoby" },
  { id: 4711, name: "Regrywalność" },
  { id: 9541, name: "Demony" },
  { id: 5711, name: "Zespołowe" },
  { id: 4236, name: "Łupy" },
  { id: 1673, name: "Kosmici" },
  { id: 21725, name: "Taktyczne RPG" },
  { id: 4115, name: "Cyberpunk" },
  { id: 5752, name: "Roboty" },
  { id: 5613, name: "Detektywistyczne" },
  { id: 5652, name: "Collectathon" },
  { id: 5673, name: "Współczesne" },
  { id: 8013, name: "Programy" },
  { id: 5030, name: "Dystopijne" },
  { id: 3813, name: "Taktyka w czasie rzeczywistym" },
  { id: 4400, name: "Abstrakcyjne" },
  { id: 1759, name: "Trwała śmierć" },
  { id: 1645, name: "Tower defense" },
  { id: 1644, name: "Kierowanie pojazdem" },
  { id: 4474, name: "CRPG" },
  { id: 1676, name: "RTS" },
  { id: 1770, name: "Gra planszowa" },
  { id: 3877, name: "Precyzyjne platformowe" },
  { id: 5547, name: "Strzelanka arenowa" },
  { id: 791774, name: "Karciany bitewniak" },
  { id: 1751, name: "Komiks" },
  { id: 29482, name: "Souls-like" },
  { id: 1714, name: "Psychodeliczne" },
  { id: 4328, name: "Budowanie miasta" },
  { id: 255534, name: "Automatyzacja" },
  { id: 97376, name: "Przytulne" },
  { id: 10397, name: "Memy" },
  { id: 4508, name: "Kampania kooperacyjna" },
  { id: 17894, name: "Koty" },
  { id: 16094, name: "Mitologia" },
  { id: 4845, name: "Kapitalizm" },
  { id: 4598, name: "Historia alternatywna" },
  { id: 4684, name: "Wojenne" },
  { id: 4046, name: "Smoki" },
  { id: 4840, name: "Lokalne dla 4 graczy" },
  { id: 13906, name: "Produkcja gier" },
  { id: 916648, name: "Zbieranie stworów" },
  { id: 7569, name: "Ruch po siatce" },
  { id: 6378, name: "Przestępczość" },
  { id: 4234, name: "Krótkie" },
  { id: 8122, name: "Edytor poziomów" },
  { id: 5363, name: "Destrukcja" },
  { id: 4158, name: "Beat 'em up" },
  { id: 4036, name: "Parkour" },
  { id: 15045, name: "Odrzutowce" },
  { id: 1734, name: "Szybkie tempo" },
  { id: 4155, name: "Klasy postaci" },
  { id: 1628, name: "Metroidvania" },
  { id: 1669, name: "Modyfikowalne" },
  { id: 872, name: "Animacja i modelowanie" },
  { id: 15277, name: "Filozoficzne" },
  { id: 8666, name: "Bieganie" },
  { id: 1621, name: "Muzyczne" },
  { id: 19995, name: "Czarna komedia" },
  { id: 4736, name: "Bijatyka 2D" },
  { id: 4202, name: "Handlowanie" },
  { id: 7948, name: "Ścieżka dźwiękowa" },
  { id: 87918, name: "Symulator farmy" },
  { id: 1100687, name: "Symulator samochodowy" },
  { id: 3920, name: "Gotowanie" },
  { id: 5765, name: "Dostosowywanie broni palnej" },
  { id: 6506, name: "Bijatyka 3D" },
  { id: 1084988, name: "Autobitewniak" },
  { id: 7178, name: "Towarzyskie" },
  { id: 3878, name: "Rywalizacja" },
  { id: 1752, name: "Rytmiczne" },
  { id: 1743, name: "Bijatyka" },
  { id: 11104, name: "Walka pojazdami" },
  { id: 5055, name: "E-sport" },
  { id: 1754, name: "MMORPG" },
  { id: 7432, name: "Inspirowane Lovecraftem" },
  { id: 5372, name: "Spisek" },
  { id: 6052, name: "Noir" },
  { id: 4559, name: "Quick time event" },
  { id: 4608, name: "Walka na miecze" },
  { id: 5794, name: "Nauka" },
  { id: 4758, name: "Strzelanka na dwa drążki" },
  { id: 24003, name: "Gra słowna" },
  { id: 220585, name: "Symulator kolonizacji" },
  { id: 1651, name: "Satyra" },
  { id: 16598, name: "Symulator kosmiczny" },
  { id: 3952, name: "Gotyk" },
  { id: 4878, name: "Parodia" },
  { id: 4364, name: "Strategiczne globalne" },
  { id: 5981, name: "Górnictwo" },
  { id: 9592, name: "Dynamiczna narracja" },
  { id: 784, name: "Obróbka filmów" },
  { id: 353880, name: "Strzelanka z łupami" },
  { id: 13782, name: "Eksperymentalne" },
  { id: 1693, name: "Klasyczne" },
  { id: 21006, name: "Podziemia" },
  { id: 176981, name: "Battle royale" },
  { id: 552282, name: "Pozytywne" },
  { id: 198631, name: "Mystery dungeon" },
  { id: 7702, name: "Narracyjne" },
  { id: 1027, name: "Obróbka dźwięku" },
  { id: 4835, name: "6 stopni swobody" },
  { id: 22602, name: "Rolnictwo" },
  { id: 10816, name: "Dzielony ekran" },
  { id: 5796, name: "Bullet time" },
  { id: 4150, name: "II wojna światowa" },
  { id: 15564, name: "Rybołówstwo" },
  { id: 6625, name: "Manipulacja czasem" },
  { id: 4853, name: "Polityczne" },
  { id: 6915, name: "Sztuki walki" },
  { id: 1091588, name: "Roguelike z tworzeniem talii" },
  { id: 5411, name: "Piękne" },
  { id: 16250, name: "Hazard" },
  { id: 4777, name: "Widowiskowa bijatyka" },
  { id: 4821, name: "Mechy" },
  { id: 1665, name: "Dopasuj 3" },
  { id: 4102, name: "Wyścigi z walką" },
  { id: 620519, name: "Strzelanka z bohaterami" },
  { id: 1637, name: "Psy" },
  { id: 3934, name: "Wciągające" },
  { id: 17770, name: "Asynchroniczne wieloosobowe" },
  { id: 10383, name: "Transport" },
  { id: 18594, name: "FMV" },
  { id: 1723, name: "RTS akcji" },
  { id: 1732, name: "Woksel" },
  { id: 1100689, name: "Survivalowe w otwartym świecie" },
  { id: 10679, name: "Podróż w czasie" },
  { id: 1688, name: "Ninja" },
  { id: 12686, name: "Wampiry" },
  { id: 9271, name: "Kolekcjonerska gra karciana" },
  { id: 4754, name: "Polityka" },
  { id: 91114, name: "Prowadzenie sklepu" },
  { id: 5300, name: "Gra w boga" },
  { id: 13070, name: "Pasjans" },
  { id: 1777, name: "Steampunk" },
  { id: 31579, name: "Otome" },
  { id: 1681, name: "Piraci" },
  { id: 9157, name: "Podwodne" },
  { id: 1023537, name: "Strzelanka w dawnym stylu" },
  { id: 1445, name: "Programy do szkoleń" },
  { id: 1717, name: "Sześciokątna siatka" },
  { id: 9564, name: "Polowanie" },
  { id: 5502, name: "Hakowanie" },
  { id: 1616, name: "Pociągi" },
  { id: 26921, name: "Symulator polityczny" },
  { id: 180368, name: "Wiara" },
  { id: 13276, name: "Czołgi" },
  { id: 1674, name: "Pisanie" },
  { id: 1718, name: "MOBA" },
  { id: 1670, name: "4X" },
  { id: 1730, name: "Sokoban" },
  { id: 97070, name: "Skrytobójcy" },
  { id: 5432, name: "Programowanie" },
  { id: 5708, name: "Remake" },
  { id: 1671, name: "Superbohater" },
  { id: 7108, name: "Imprezowe" },
  { id: 6310, name: "Dyplomacja" },
  { id: 5160, name: "Dinozaury" },
  { id: 3955, name: "Trzecioosobowa gra akcji" },
  { id: 1647, name: "Western" },
  { id: 809, name: "Obróbka zdjęć" },
  { id: 8093, name: "Minigry" },
  { id: 1680, name: "Napad" },
  { id: 11123, name: "Tylko mysz" },
  { id: 5179, name: "Zimna wojna" },
  { id: 454187, name: "Tradycyjne roguelike" },
  { id: 6910, name: "Morskie" },
  { id: 723991, name: "Bullet heaven" },
  { id: 9626, name: "Zwierzęta" },
  { id: 9803, name: "Śnieg" },
  { id: 4137, name: "Transhumanizm" },
  { id: 35079, name: "Symulator pracy" },
  { id: 4994, name: "Walka morska" },
  { id: 13577, name: "Żeglarstwo" },
  { id: 769306, name: "Escape room" },
  { id: 13382, name: "Łucznictwo" },
  { id: 4190, name: "Uzależniające" },
  { id: 6041, name: "Konie" },
  { id: 4161, name: "Czas rzeczywisty" },
  { id: 14720, name: "Nostalgia" },
  { id: 4520, name: "Farma" },
  { id: 4242, name: "Odcinkowe" },
  { id: 8253, name: "Generacja proceduralna oparta na muzyce" },
  { id: 1254546, name: "Piłka nożna" },
  { id: 17015, name: "Wilkołaki" },
  { id: 3965, name: "Epicka skala" },
  { id: 10437, name: "Quizy" },
  { id: 7622, name: "Offroad" },
  { id: 11333, name: "Zły protagonista" },
  { id: 5390, name: "Gry na czas" },
  { id: 7107, name: "Czas rzeczywisty z pauzą" },
  { id: 7423, name: "Snajper" },
  { id: 56690, name: "Celowniczki" },
  { id: 5230, name: "Kontynuacja" },
  { id: 71389, name: "Pisownia" },
  { id: 6702, name: "Mars" },
  { id: 1100686, name: "Symulator katastroficzny" },
  { id: 5382, name: "I wojna światowa" },
  { id: 4535, name: "Krasnoludy" },
  { id: 12190, name: "Boks" },
  { id: 4184, name: "Szachy" },
  { id: 4291, name: "Statki kosmiczne" },
  { id: 25085, name: "Sterowanie dotykowe" },
  { id: 5348, name: "Mod" },
  { id: 1199779, name: "Strzelanka ewakuacyjna" },
  { id: 1746, name: "Koszykówka" },
  { id: 7038, name: "Golf" },
  { id: 1100688, name: "Symulator medyczny" },
  { id: 19780, name: "Okręty podwodne" },
  { id: 1320952, name: "Towarzysz pulpitu" },
  { id: 745697, name: "Dedukcyjne towarzyskie" },
  { id: 198913, name: "Motocykle" },
  { id: 42089, name: "Straszaki" },
  { id: 5727, name: "Baseball" },
  { id: 150626, name: "Gamingowe" },
  { id: 776177, name: "Film 360" },
  { id: 7556, name: "Kości do gry" },
  { id: 6948, name: "Rzym" },
  { id: 6621, name: "Pinball" },
  { id: 123332, name: "Jednoślady" },
  { id: 61357, name: "Muzyka elektroniczna" },
  { id: 6054, name: "Elfy" },
  { id: 856791, name: "Asymetryczne VR" },
  { id: 11095, name: "Boss rush" },
  { id: 47827, name: "Zapasy" },
  { id: 1753, name: "Deskorolki" },
  { id: 889937, name: "Dekorowanie" },
  { id: 15954, name: "Cichy protagonista" },
  { id: 189941, name: "Muzyka instrumentalna" },
  { id: 1254552, name: "Futbol amerykański" },
  { id: 22955, name: "Minigolf" },
  { id: 4852, name: "Bilard" },
  { id: 11634, name: "Wikingowie" },
  { id: 1239876, name: "Organizacja" },
  { id: 96359, name: "Skating" },
  { id: 337964, name: "Muzyka rockowa" },
  { id: 25959, name: "Wuxia" },
  { id: 19568, name: "Kolarstwo" },
  { id: 23491, name: "Sprzątanie" },
  { id: 760247, name: "Xianxia" },
  { id: 6214, name: "Ptaki" },
  { id: 8075, name: "TrackIR" },
  { id: 5914, name: "Tenis" },
  { id: 15868, name: "Motocross" },
  { id: 14906, name: "Celowo udziwnione sterowanie" },
  { id: 52406, name: "Kult" },
  { id: 1776, name: "Szpiegostwo" },
  { id: 33572, name: "Madżong" },
  { id: 324176, name: "Hokej" },
  { id: 7328, name: "Kręgle" },
  { id: 3796, name: "Na podstawie książki" },
  { id: 507423, name: "Lisy" },
  { id: 27758, name: "Kontrola głosem" },
  { id: 129761, name: "Czterokołowce" },
  { id: 17337, name: "Lemingi" },
  { id: 117648, name: "Muzyka 8-bitowa" },
  { id: 28444, name: "Snowboard" },
  { id: 7309, name: "Narciarstwo" },
  { id: 6835, name: "Poker" },
  { id: 603297, name: "Sprzęt" },
  { id: 10617, name: "Samurajowie" },
  { id: 252854, name: "BMX" },
  { id: 37376, name: "Spadające klocki" },
  { id: 323922, name: "Musou" },
  { id: 5407, name: "Benchmark" },
  { id: 1220528, name: "Symulator hobby" },
  { id: 21635, name: "Nauka języków" },
  { id: 20486, name: "Wilki" },
  { id: 1352486, name: "Kapibary" },
  { id: 46348, name: "Zoo" },
  { id: 158638, name: "Krykiet" },
  { id: 847164, name: "Siatkówka" },
  { id: 49213, name: "Rugby" },
  { id: 363767, name: "Snooker" },
  { id: 5941, name: "Reboot" },
];
```

- [ ] **Step 2: Replace `GENRE_TAG_IDS` with `resolveSteamTagId`**

In `src/lib/steam.ts`, add the import at the top of the file:
```ts
import { STEAM_TAG_CATALOG } from "@/lib/steamTagCatalog";
```

Replace:
```ts
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
```
with:
```ts
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
```

- [ ] **Step 3: Update the discover route**

In `src/app/api/steam/discover/route.ts`, replace:
```ts
import { fetchDiscoverPage, GENRE_TAG_IDS } from "@/lib/steam";
```
with:
```ts
import { fetchDiscoverPage, resolveSteamTagId } from "@/lib/steam";
```

Replace:
```ts
  const tagIds = genresParam
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => GENRE_TAG_IDS[g])
    .filter((id): id is number => id !== undefined);
```
with:
```ts
  const tagIds = genresParam
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => resolveSteamTagId(g))
    .filter((id): id is number => id !== undefined);
```

- [ ] **Step 4: Build and test to verify**

Run: `npm run build`
Expected: succeeds — no remaining references to `GENRE_TAG_IDS` anywhere (`grep -rn "GENRE_TAG_IDS" src/` returns nothing).

Run: `npx vitest run`
Expected: all existing suites still pass (no test referenced `GENRE_TAG_IDS` by name, confirmed during planning).

- [ ] **Step 5: Manual verification**

`npm run dev`, then:
```bash
curl -s "http://localhost:3000/api/steam/discover?genres=Metroidvania&start=0" | head -c 300
curl -s "http://localhost:3000/api/steam/discover?genres=Kooperacja&start=0" | head -c 300
```
Expected: both return `{ "appIds": [...], "hasMore": ... }` with real app IDs (not empty arrays) — confirms `resolveSteamTagId` correctly resolves both an original genre-table entry and a new catalog-only tag name to a working Steam tag ID.

- [ ] **Step 6: Commit**

```bash
git add src/lib/steamTagCatalog.ts src/lib/steam.ts src/app/api/steam/discover/route.ts
git commit -m "feat: pelny katalog 432 tagow Steama, resolveSteamTagId zastepuje GENRE_TAG_IDS"
```

---

## Task 5: Release-date filter helpers (TDD)

**Files:**
- Modify: `src/lib/releaseCountdown.ts`
- Create: `src/lib/releaseCountdown.test.ts`

**Interfaces:**
- Produces: `isRecentRelease(releaseDate: { comingSoon: boolean; date: string } | null, now?: Date): boolean`, `isUpcomingSoon(releaseDate: { comingSoon: boolean; date: string } | null, now?: Date): boolean`.
- Consumes: existing `daysUntil(dateString: string, now?: Date): number | null` in the same file — unchanged.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/releaseCountdown.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isRecentRelease, isUpcomingSoon } from "./releaseCountdown";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/releaseCountdown.test.ts`
Expected: FAIL — `isRecentRelease`/`isUpcomingSoon` not exported from `./releaseCountdown`.

- [ ] **Step 3: Implement**

Append to `src/lib/releaseCountdown.ts`:
```ts
const RECENT_RELEASE_WINDOW_DAYS = 60;
const UPCOMING_WINDOW_DAYS = 7;

/** "Nowości" -- gra już wydana (nie comingSoon) w ciągu ostatnich 60 dni.
 * Data nieparsowalna (np. "Q3 2026") liczy się jako niepasująca, nie błąd. */
export function isRecentRelease(
  releaseDate: { comingSoon: boolean; date: string } | null,
  now: Date = new Date(),
): boolean {
  if (!releaseDate || releaseDate.comingSoon) return false;
  const days = daysUntil(releaseDate.date, now);
  return days !== null && days >= -RECENT_RELEASE_WINDOW_DAYS && days <= 0;
}

/** "Wkrótce" -- gra jeszcze niewydana (comingSoon), premiera w ciągu 7 dni. */
export function isUpcomingSoon(
  releaseDate: { comingSoon: boolean; date: string } | null,
  now: Date = new Date(),
): boolean {
  if (!releaseDate || !releaseDate.comingSoon) return false;
  const days = daysUntil(releaseDate.date, now);
  return days !== null && days >= 0 && days <= UPCOMING_WINDOW_DAYS;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/releaseCountdown.test.ts`
Expected: PASS, 12/12.

- [ ] **Step 5: Commit**

```bash
git add src/lib/releaseCountdown.ts src/lib/releaseCountdown.test.ts
git commit -m "feat: isRecentRelease/isUpcomingSoon - filtr Nowosci/Wkrotce z daty premiery"
```

---

## Task 6: Rename `matchesGenreFilter` → `matchesTagFilter`

**Files:**
- Modify: `src/lib/steamLibrary.ts`
- Modify: `src/lib/steamLibrary.test.ts`
- Modify: `src/components/solo/SoloSwipeScreen.tsx`
- Modify: `src/components/room/RoomExploreScreen.tsx`

**Interfaces:**
- Renames: `matchesGenreFilter` → `matchesTagFilter`. Signature/behavior unchanged (`(arr: string[], selected: string[]) => boolean`).

This is a pure rename for clarity — the function is already generic (works on any string array), but from this task's later Task 8/9 wiring it will be called with `game.tags`, not `game.genres`, so the old name would be actively misleading.

- [ ] **Step 1: Rename in `steamLibrary.ts`**

Replace:
```ts
/** Puste `selected` = brak filtra (wszystko przechodzi). W przeciwnym razie
 * gra musi mieć co najmniej jeden z wybranych gatunków. */
export function matchesGenreFilter(genres: string[], selected: string[]): boolean {
  if (selected.length === 0) return true;
  return genres.some((g) => selected.includes(g));
}
```
with:
```ts
/** Puste `selected` = brak filtra (wszystko przechodzi). W przeciwnym razie
 * gra musi mieć co najmniej jeden z wybranych tagów. Generyczna -- działa
 * na dowolnej tablicy stringów (dziś: game.tags, dawniej: game.genres). */
export function matchesTagFilter(tags: string[], selected: string[]): boolean {
  if (selected.length === 0) return true;
  return tags.some((t) => selected.includes(t));
}
```

- [ ] **Step 2: Rename in `steamLibrary.test.ts`**

Replace:
```ts
import {
  computeSharedLibrary,
  filterByPlaytime,
  matchesGenreFilter,
  matchesMultiplayerFilter,
  shuffleGames,
  type SteamOwnedGame,
} from "./steamLibrary";
```
with:
```ts
import {
  computeSharedLibrary,
  filterByPlaytime,
  matchesTagFilter,
  matchesMultiplayerFilter,
  shuffleGames,
  type SteamOwnedGame,
} from "./steamLibrary";
```

Replace:
```ts
describe("matchesGenreFilter", () => {
  it("dopasowuje wszystko, gdy nic nie wybrano", () => {
    expect(matchesGenreFilter(["RPG"], [])).toBe(true);
    expect(matchesGenreFilter([], [])).toBe(true);
  });

  it("dopasowuje gdy gra ma choć jeden z wybranych gatunkow", () => {
    expect(matchesGenreFilter(["Akcja", "RPG"], ["RPG", "Strategie"])).toBe(true);
  });

  it("odrzuca gdy gra nie ma zadnego z wybranych gatunkow", () => {
    expect(matchesGenreFilter(["Sportowe"], ["RPG", "Strategie"])).toBe(false);
  });
});
```
with:
```ts
describe("matchesTagFilter", () => {
  it("dopasowuje wszystko, gdy nic nie wybrano", () => {
    expect(matchesTagFilter(["RPG"], [])).toBe(true);
    expect(matchesTagFilter([], [])).toBe(true);
  });

  it("dopasowuje gdy gra ma choc jeden z wybranych tagow", () => {
    expect(matchesTagFilter(["Akcja", "RPG"], ["RPG", "Strategie"])).toBe(true);
  });

  it("odrzuca gdy gra nie ma zadnego z wybranych tagow", () => {
    expect(matchesTagFilter(["Sportowe"], ["RPG", "Strategie"])).toBe(false);
  });
});
```

- [ ] **Step 3: Update the two call sites (import only for now — call-site logic changes in Tasks 8/9)**

In `src/components/solo/SoloSwipeScreen.tsx`, replace:
```tsx
import { matchesGenreFilter, matchesMultiplayerFilter, type MultiplayerFilter, type SteamOwnedGame } from "@/lib/steamLibrary";
```
with:
```tsx
import { matchesTagFilter, matchesMultiplayerFilter, type MultiplayerFilter, type SteamOwnedGame } from "@/lib/steamLibrary";
```
And replace the call itself (mechanical rename only, arguments unchanged for now):
```tsx
        if (!matchesGenreFilter(genres, genreFilter)) continue;
```
with:
```tsx
        if (!matchesTagFilter(genres, genreFilter)) continue;
```

In `src/components/room/RoomExploreScreen.tsx`, replace:
```tsx
import {
  computeSharedLibrary,
  matchesGenreFilter,
  matchesMultiplayerFilter,
  type MultiplayerFilter,
} from "@/lib/steamLibrary";
```
with:
```tsx
import {
  computeSharedLibrary,
  matchesTagFilter,
  matchesMultiplayerFilter,
  type MultiplayerFilter,
} from "@/lib/steamLibrary";
```
And replace:
```tsx
        if (!matchesGenreFilter(data.genres ?? [], genres)) continue;
```
with:
```tsx
        if (!matchesTagFilter(data.genres ?? [], genres)) continue;
```

(Both call sites still pass `genres`, not `tags` — that field swap is Task 8/9's job, bundled with the sentinel sniffing logic so it's reviewed as one coherent behavioral change instead of splitting a rename from a behavior change across two tasks.)

- [ ] **Step 4: Build and test to verify**

Run: `npm run build`
Expected: succeeds — `grep -rn "matchesGenreFilter" src/` returns nothing.

Run: `npx vitest run`
Expected: all pass, including the renamed `matchesTagFilter` describe block.

- [ ] **Step 5: Commit**

```bash
git add src/lib/steamLibrary.ts src/lib/steamLibrary.test.ts src/components/solo/SoloSwipeScreen.tsx src/components/room/RoomExploreScreen.tsx
git commit -m "refactor: matchesGenreFilter -> matchesTagFilter (przygotowanie pod filtrowanie po tags)"
```

---

## Task 7: `TagFilterBar` component (rename + pinned tags + popular tags + search)

**Files:**
- Create: `src/components/swipe/TagFilterBar.tsx`
- Delete: `src/components/swipe/GenreFilterBar.tsx`

**Interfaces:**
- Produces: `TagFilterBar({ value: string[], onChange: (value: string[]) => void })` — same public shape as the old `GenreFilterBar`, drop-in replacement. Also exports `NEW_RELEASE_TAG: string` and `UPCOMING_TAG: string` (sentinel constants consumed by Tasks 8/9).

- [ ] **Step 1: Verify the new icons exist**

Already confirmed present in `node_modules/lucide-react` during planning: `Search`, `ChevronRight`, `Users`, `Users2`, `Sparkles`, `CalendarClock` (alongside the 8 genre icons already used by the old `GenreFilterBar`: `Swords`, `Compass`, `Wand2`, `Castle`, `Cog`, `Gem`, `Smile`, `Trophy`).

- [ ] **Step 2: Create `TagFilterBar.tsx`**

Create `src/components/swipe/TagFilterBar.tsx`:
```tsx
"use client";

import { useRef, useState } from "react";
import {
  Search,
  ChevronRight,
  Users,
  Users2,
  Sparkles,
  CalendarClock,
  Swords,
  Compass,
  Wand2,
  Castle,
  Cog,
  Gem,
  Smile,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { GENRE_OPTIONS } from "@/lib/steamLibrary";
import { STEAM_TAG_CATALOG } from "@/lib/steamTagCatalog";

/** Sentinel-e (nie prawdziwe tagi Steama) dla pigułek filtra daty premiery --
 * ekrany swipe (SoloSwipeScreen/RoomExploreScreen) wyciągają je z `value`
 * osobno od prawdziwych tagów przed wywołaniem matchesTagFilter. */
export const NEW_RELEASE_TAG = "__new_release__";
export const UPCOMING_TAG = "__upcoming__";

const GENRE_ICONS: Record<string, LucideIcon> = {
  Akcja: Swords,
  Przygodowe: Compass,
  RPG: Wand2,
  Strategie: Castle,
  Symulacje: Cog,
  Niezależne: Gem,
  Rekreacyjne: Smile,
  Sportowe: Trophy,
};

type Pill = { value: string; label: string; icon: LucideIcon | null };

const PINNED_TAGS: Pill[] = [
  { value: "Kooperacja", label: "Kooperacja", icon: Users2 },
  { value: "Wieloosobowa", label: "Multiplayer", icon: Users },
  { value: NEW_RELEASE_TAG, label: "Nowości", icon: Sparkles },
  { value: UPCOMING_TAG, label: "Wkrótce", icon: CalendarClock },
];

const GENRE_PILLS: Pill[] = GENRE_OPTIONS.map((g) => ({
  value: g.value,
  label: g.label,
  icon: GENRE_ICONS[g.value] ?? null,
}));

const RESERVED_VALUES = new Set([...PINNED_TAGS, ...GENRE_PILLS].map((p) => p.value));

const EXTRA_POPULAR_COUNT = 15;
const EXTRA_POPULAR_PILLS: Pill[] = STEAM_TAG_CATALOG.filter((t) => !RESERVED_VALUES.has(t.name))
  .slice(0, EXTRA_POPULAR_COUNT)
  .map((t) => ({ value: t.name, label: t.name, icon: null }));

const SEARCH_RESULT_LIMIT = 5;
const SCROLL_STEP_PX = 160;

function pillClassName(active: boolean): string {
  return active
    ? "border-accent-brand bg-card flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold text-foreground"
    : "border-border bg-card flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-text-secondary";
}

/** Pasek tagów nad kartą swipe (Explore) -- dawniej GenreFilterBar (tylko 8
 * gatunków), teraz ogólny filtr: Kooperacja/Multiplayer/Nowości/Wkrótce na
 * stałe przypięte, potem 8 gatunków, potem popularne tagi Steama, na końcu
 * wyszukiwarka pełnej listy 432 tagów (STEAM_TAG_CATALOG). Zawsze widoczny,
 * przewijany w bok, wzorem Dustpile -- ten sam wizualny język co wcześniej. */
export function TagFilterBar({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((v) => v !== tag) : [...value, tag]);
  }

  function selectFromSearch(tag: string) {
    if (!value.includes(tag)) onChange([...value, tag]);
    setQuery("");
    setSearchOpen(false);
  }

  function scrollRight() {
    scrollRef.current?.scrollBy({ left: SCROLL_STEP_PX, behavior: "smooth" });
  }

  const trimmedQuery = query.trim().toLowerCase();
  const searchMatches =
    trimmedQuery.length > 0
      ? STEAM_TAG_CATALOG.filter((t) => t.name.toLowerCase().includes(trimmedQuery)).slice(0, SEARCH_RESULT_LIMIT)
      : [];

  const allPills = [...PINNED_TAGS, ...GENRE_PILLS, ...EXTRA_POPULAR_PILLS];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div
          ref={scrollRef}
          className="flex flex-1 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {allPills.map((pill) => {
            const active = value.includes(pill.value);
            const Icon = pill.icon;
            return (
              <button
                key={pill.value}
                type="button"
                onClick={() => toggle(pill.value)}
                aria-pressed={active}
                className={pillClassName(active)}
                style={active ? { boxShadow: `0 0 12px var(--accent-glow)` } : undefined}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {pill.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={scrollRight}
          aria-label="Pokaż więcej tagów"
          className="bg-secondary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          aria-label="Szukaj tagu"
          aria-pressed={searchOpen}
          className={
            searchOpen
              ? "bg-accent-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
              : "bg-secondary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground"
          }
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>

      {searchOpen && (
        <div className="flex flex-col gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj tagu…"
            autoFocus
            className="bg-card border-border rounded-xl border px-3 py-1.5 text-xs text-foreground"
          />
          {searchMatches.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {searchMatches.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectFromSearch(t.name)}
                  className="border-border bg-card flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-text-secondary"
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Delete the old component**

```bash
git rm src/components/swipe/GenreFilterBar.tsx
```

(Do this via `git rm`, not a plain filesystem delete, so the removal is staged along with the new file in one commit.)

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: **fails** at this point — `SoloSwipeScreen.tsx`/`RoomExploreScreen.tsx` still import the now-deleted `GenreFilterBar`. This is expected; Tasks 8/9 fix the remaining call sites. Confirm the failure is specifically an unresolved-import error for `GenreFilterBar` (not something else), then proceed — do not attempt to fix those two files in this task, that's Task 8/9's job (keeps this task's diff focused on the component itself).

- [ ] **Step 5: Commit**

```bash
git add src/components/swipe/TagFilterBar.tsx
git commit -m "feat: TagFilterBar zastepuje GenreFilterBar - przypiete Kooperacja/Multiplayer/Nowosci/Wkrotce, popularne tagi, wyszukiwarka"
```

(The build failure from Step 4 is expected and temporary — it resolves in Task 8.)

---

## Task 8: Wire `TagFilterBar` into `SoloSwipeScreen`

**Files:**
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

**Interfaces:**
- Consumes: `TagFilterBar`, `NEW_RELEASE_TAG`, `UPCOMING_TAG` (Task 7), `isRecentRelease`, `isUpcomingSoon` (Task 5), `matchesTagFilter` (Task 6, already imported).

- [ ] **Step 1: Update imports**

Replace:
```tsx
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { GenreFilterBar } from "@/components/swipe/GenreFilterBar";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import type { SwipeGame } from "@/lib/types";
import { matchesTagFilter, matchesMultiplayerFilter, type MultiplayerFilter, type SteamOwnedGame } from "@/lib/steamLibrary";
```
with:
```tsx
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { TagFilterBar, NEW_RELEASE_TAG, UPCOMING_TAG } from "@/components/swipe/TagFilterBar";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import type { SwipeGame } from "@/lib/types";
import { matchesTagFilter, matchesMultiplayerFilter, type MultiplayerFilter, type SteamOwnedGame } from "@/lib/steamLibrary";
import { isRecentRelease, isUpcomingSoon } from "@/lib/releaseCountdown";
```

- [ ] **Step 2: Filter on `tags`, split out the date sentinels**

Replace:
```tsx
        const tags = data.tags ?? [];
        const genres = data.genres ?? [];
        if (!matchesMultiplayerFilter(tags, multiplayerFilter)) continue;
        if (!matchesTagFilter(genres, genreFilter)) continue;
```
with:
```tsx
        const tags = data.tags ?? [];
        const genres = data.genres ?? [];
        if (!matchesMultiplayerFilter(tags, multiplayerFilter)) continue;
        const realTags = genreFilter.filter((v) => v !== NEW_RELEASE_TAG && v !== UPCOMING_TAG);
        if (!matchesTagFilter(tags, realTags)) continue;
        const wantsNew = genreFilter.includes(NEW_RELEASE_TAG);
        const wantsSoon = genreFilter.includes(UPCOMING_TAG);
        if (wantsNew || wantsSoon) {
          const matchesDate =
            (wantsNew && isRecentRelease(data.releaseDate)) || (wantsSoon && isUpcomingSoon(data.releaseDate));
          if (!matchesDate) continue;
        }
```

(`genres` stays used a few lines below when building the `SwipeGame` object's `genres` field — unrelated to filtering, untouched.)

- [ ] **Step 3: Render `TagFilterBar` instead of `GenreFilterBar`**

Replace:
```tsx
      <GenreFilterBar value={genreFilter} onChange={setGenreFilter} />
```
with:
```tsx
      <TagFilterBar value={genreFilter} onChange={setGenreFilter} />
```

(The `genreFilter`/`setGenreFilter` state itself is untouched — same `useState<string[]>([])` from Task 3 of the prior Explore v2 plan. It now just also carries the two sentinel strings when those pills are toggled.)

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: succeeds — this resolves Task 7's expected temporary failure for this file.

- [ ] **Step 5: Manual verification**

`npm run dev`, open solo Explore (either source). Confirm: `TagFilterBar` renders with Kooperacja/Multiplayer/Nowości/Wkrótce first, then 8 genres, then more tags, then a search icon. Toggle "Kooperacja" — next cards should all show "Kooperacja" among their tags. Toggle "Wkrótce" — next cards should be upcoming/unreleased games. Use the search box to find and select an uncommon tag (e.g. "Metroidvania") — confirm it appears as a new active pill and filters accordingly.

- [ ] **Step 6: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: TagFilterBar w SoloSwipeScreen - filtrowanie po tags + Nowosci/Wkrotce"
```

---

## Task 9: Wire `TagFilterBar` into `RoomExploreScreen`

**Files:**
- Modify: `src/components/room/RoomExploreScreen.tsx`

**Interfaces:**
- Consumes: same as Task 8, room-side equivalents.

- [ ] **Step 1: Update imports**

Replace:
```tsx
import { ToggleChip } from "@/components/ui/ToggleChip";
import { GenreFilterBar } from "@/components/swipe/GenreFilterBar";
import {
  computeSharedLibrary,
  matchesTagFilter,
  matchesMultiplayerFilter,
  type MultiplayerFilter,
} from "@/lib/steamLibrary";
```
with:
```tsx
import { ToggleChip } from "@/components/ui/ToggleChip";
import { TagFilterBar, NEW_RELEASE_TAG, UPCOMING_TAG } from "@/components/swipe/TagFilterBar";
import {
  computeSharedLibrary,
  matchesTagFilter,
  matchesMultiplayerFilter,
  type MultiplayerFilter,
} from "@/lib/steamLibrary";
import { isRecentRelease, isUpcomingSoon } from "@/lib/releaseCountdown";
```

- [ ] **Step 2: Filter on `tags`, split out the date sentinels**

Replace:
```tsx
        if (!matchesMultiplayerFilter(data.tags ?? [], multiplayer)) continue;
        if (!matchesTagFilter(data.genres ?? [], genres)) continue;
```
with:
```tsx
        if (!matchesMultiplayerFilter(data.tags ?? [], multiplayer)) continue;
        const realTags = genres.filter((v) => v !== NEW_RELEASE_TAG && v !== UPCOMING_TAG);
        if (!matchesTagFilter(data.tags ?? [], realTags)) continue;
        const wantsNew = genres.includes(NEW_RELEASE_TAG);
        const wantsSoon = genres.includes(UPCOMING_TAG);
        if (wantsNew || wantsSoon) {
          const matchesDate =
            (wantsNew && isRecentRelease(data.releaseDate)) || (wantsSoon && isUpcomingSoon(data.releaseDate));
          if (!matchesDate) continue;
        }
```

- [ ] **Step 3: Render `TagFilterBar` instead of `GenreFilterBar`**

Replace:
```tsx
      <GenreFilterBar value={genres} onChange={handleGenreChange} />
```
with:
```tsx
      <TagFilterBar value={genres} onChange={handleGenreChange} />
```

(`genres`/`handleGenreChange` unchanged — still synced through `rooms/{roomCode}/session/state.exploreGenreFilter` exactly as before; the Firestore field now also carries the two sentinel strings when those pills are toggled, which is harmless — it's still just a `string[]`.)

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual verification (two tabs)**

`npm run dev`, join the same room from two tabs. Start Explore (either source), confirm `TagFilterBar` renders and behaves identically to the solo version. Toggle "Nowości" in tab A, confirm it syncs live to tab B (same Firestore mechanism already verified for the 8-genre bar). Confirm the currently-shown card in either tab doesn't change when the filter changes, only future cards (same guarantee as before, now covering tags and date filters too).

- [ ] **Step 6: Commit**

```bash
git add src/components/room/RoomExploreScreen.tsx
git commit -m "feat: TagFilterBar w RoomExploreScreen - filtrowanie po tags + Nowosci/Wkrotce"
```

---

## Task 10: Full regression pass + deploy

**Files:** none (verification + deploy only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds with zero type errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all suites pass, including the new `reviewScore.test.ts` and `releaseCountdown.test.ts` additions and the renamed `matchesTagFilter` suite in `steamLibrary.test.ts`.

- [ ] **Step 3: Manual regression check of untouched flows**

`npm run dev`. Confirm unaffected: old manual pool + eliminacja rundowa, Wersus (solo i pokój), mini-gry (Koło/Plinko/Rzut monetą), ekran Polubionych, Odkrywaj pagination (from the prior Explore v2 work) still functions with the new tag-based filtering layered on top.

- [ ] **Step 4: Push to trigger Vercel auto-deploy**

```bash
git push origin master
```

- [ ] **Step 5: Verify the live deploy**

Poll `https://tumolec.vercel.app/api/steam/discover?genres=Metroidvania&start=0` until it returns real app IDs (confirms the new `resolveSteamTagId`-based route is live, since `Metroidvania` only resolves through the new 432-tag catalog, not the old 8-entry `GENRE_TAG_IDS`). Then manually open the live site (Playwright), start Explore, and confirm the `TagFilterBar` with pinned tags + search renders and works against production data.

- [ ] **Step 6: Update the vault**

After deploy is confirmed: add a dated entry to `work/active/Tumolec.md` roadmap summarizing the four fixes/features, per this vault's session-end convention.
