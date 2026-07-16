# Explore v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the genre filter from Explore's start screens onto the swipe screen itself (live, synced across co-op players), and add "Odkrywaj" — the full Steam catalog — as a third Explore candidate source alongside the user's own/shared library.

**Architecture:** Phase A adds a new `GenreFilterBar` UI component (reused by solo and room Explore) and moves genre filtering from a one-time pre-swipe choice into local/synced state read live by the existing lazy per-card `advance()` loops. Phase B adds a server-side proxy (`/api/steam/discover`) that wraps Steam's unofficial (HTML-returning) search endpoint, extracting app IDs with a regex (verified against real Steam responses — no new dependency needed), and wires it into both swipe screens as a third, paginated candidate source. Client-side `matchesGenreFilter`/`matchesMultiplayerFilter` remain the correctness backstop for every source; server-side tag filtering is only a relevance/efficiency optimization.

**Tech Stack:** Next.js 16 App Router, TypeScript, Firebase Firestore (`rooms/{code}/session/state` for co-op sync), Vitest, `lucide-react` icons (already a dependency).

## Global Constraints

- `npm run build` and `npx vitest run` must pass after every task (repo convention, see `AGENTS.md`/spec Weryfikacja).
- No new npm dependencies — regex is sufficient to parse Steam's search HTML (verified live, see Task 6).
- Firestore writes to `rooms/{roomCode}/session/state` must always use `setDoc(..., { merge: true })` on a single nested field — never overwrite the whole document (it also holds `coinflip`/`wheel`/`plinko`).
- Client-side genre/multiplayer filtering (`matchesGenreFilter`, `matchesMultiplayerFilter`) is the single source of truth for whether a card is shown — server-side Steam tag filtering is an optimization only, never assumed correct on its own.
- Commit after every task, Polish commit messages, lowercase type prefix (`feat:`, `fix:`, `refactor:`), matching existing `git log` style.

---

## Task 1: `GenreFilterBar` component

**Files:**
- Create: `src/components/swipe/GenreFilterBar.tsx`

**Interfaces:**
- Produces: `GenreFilterBar({ value: string[], onChange: (value: string[]) => void })` — a horizontally-scrollable row of icon+label pill toggles, one per `GENRE_OPTIONS` entry (`@/lib/steamLibrary`). Multi-select (toggle on/off), same visual language (border/glow) as `MultiToggleChip`.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { Swords, Compass, Wand2, Castle, Cog, Gem, Smile, Trophy, type LucideIcon } from "lucide-react";
import { GENRE_OPTIONS } from "@/lib/steamLibrary";

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

/** Pasek gatunków nad kartą swipe (Explore) -- zawsze widoczny, przewijany
 * w bok, wzorem Dustpile. W przeciwieństwie do MultiToggleChip (siatka na
 * ekranach ustawień) to jeden przewijany rząd małych pigułek ikona+etykieta,
 * bo ma żyć NAD GameDetailLayout bez zasłaniania karty. */
export function GenreFilterBar({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  function toggle(genre: string) {
    onChange(value.includes(genre) ? value.filter((g) => g !== genre) : [...value, genre]);
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {GENRE_OPTIONS.map((opt) => {
        const active = value.includes(opt.value);
        const Icon = GENRE_ICONS[opt.value];
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            className={
              active
                ? "border-accent-brand bg-card flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold text-foreground"
                : "border-border bg-card flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-text-secondary"
            }
            style={active ? { boxShadow: `0 0 12px var(--accent-glow)` } : undefined}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify no type errors**

Run: `npm run build`
Expected: succeeds (component is unused so far, but must type-check — `lucide-react` icon names `Swords`/`Compass`/`Wand2`/`Castle`/`Cog`/`Gem`/`Smile`/`Trophy` are confirmed present in `node_modules/lucide-react`).

- [ ] **Step 3: Commit**

```bash
git add src/components/swipe/GenreFilterBar.tsx
git commit -m "feat: pasek filtra gatunkow (GenreFilterBar) nad karta swipe"
```

---

## Task 2: Firestore sync for the room genre filter

**Files:**
- Modify: `src/lib/rooms.ts` (add near the coinflip/wheel/plinko `session/state` helpers, e.g. after `subscribeToWheel`, before the "Paczki gier" section)

**Interfaces:**
- Consumes: `db` (`@/lib/firebase`), `doc`/`setDoc`/`onSnapshot` (already imported in this file).
- Produces: `setExploreGenreFilter(roomCode: string, genres: string[]): Promise<void>`, `subscribeToExploreGenreFilter(roomCode: string, onChange: (genres: string[]) => void): () => void`.

- [ ] **Step 1: Add the two functions**

Insert after the `subscribeToWheel` function (currently ending around line 353 with its closing `}`), before the `// ── Paczki gier ──` comment:

```ts
// ── Filtr gatunków Explore (pokój) ──────────────────────────────────────
// TEN SAM dokument `rooms/{roomCode}/session/state` co coinflip/wheel/plinko
// -- `setDoc(..., { merge: true })` na samym polu `exploreGenreFilter`, żeby
// nigdy nie nadpisać pozostałych pól. Każdy gracz widzi i może zmieniać
// filtr drugiego (allow write: if true na tym dokumencie, niski risk).

export async function setExploreGenreFilter(roomCode: string, genres: string[]) {
  await setDoc(doc(db, "rooms", roomCode, "session", "state"), { exploreGenreFilter: genres }, { merge: true });
}

export function subscribeToExploreGenreFilter(roomCode: string, onChange: (genres: string[]) => void) {
  return onSnapshot(doc(db, "rooms", roomCode, "session", "state"), (snap) => {
    onChange(snap.exists() ? ((snap.data().exploreGenreFilter as string[] | undefined) ?? []) : []);
  });
}
```

- [ ] **Step 2: Build to verify no type errors**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rooms.ts
git commit -m "feat: sync filtra gatunkow Explore przez rooms/session/state"
```

---

## Task 3: Solo — move genre filter onto the swipe screen

**Files:**
- Modify: `src/components/solo/SoloSettingsScreen.tsx`
- Modify: `src/components/solo/SoloHome.tsx`
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

**Interfaces:**
- Consumes: `GenreFilterBar` (Task 1).
- Produces: `SoloSettingsScreen`'s `onLoadLibrary` drops its `genres` parameter; `SoloSwipeScreen` no longer takes a `genreFilter` prop (owns it as local state instead).

- [ ] **Step 1: Remove the genre picker from `SoloSettingsScreen`**

In `src/components/solo/SoloSettingsScreen.tsx`:

Replace the import block:
```tsx
import { ToggleChip } from "@/components/ui/ToggleChip";
import { MultiToggleChip } from "@/components/ui/MultiToggleChip";
import { roomExists, createRoom, joinRoom } from "@/lib/rooms";
import { GENRE_OPTIONS, type BacklogFilter, type MultiplayerFilter } from "@/lib/steamLibrary";
```
with:
```tsx
import { ToggleChip } from "@/components/ui/ToggleChip";
import { roomExists, createRoom, joinRoom } from "@/lib/rooms";
import { type BacklogFilter, type MultiplayerFilter } from "@/lib/steamLibrary";
```

Replace the component signature and its `genres` state:
```tsx
export function SoloSettingsScreen({
  onLoadLibrary,
  loading,
  error,
}: {
  onLoadLibrary: (profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter, genres: string[]) => void;
  loading: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState("");
  const [backlog, setBacklog] = useState<BacklogFilter>("never");
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("all");
  const [genres, setGenres] = useState<string[]>([]);
```
with:
```tsx
export function SoloSettingsScreen({
  onLoadLibrary,
  loading,
  error,
}: {
  onLoadLibrary: (profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) => void;
  loading: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState("");
  const [backlog, setBacklog] = useState<BacklogFilter>("never");
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("all");
```

Remove the "Jaki gatunek?" block entirely:
```tsx
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-foreground">Jaki gatunek?</p>
          <MultiToggleChip value={genres} options={GENRE_OPTIONS} onChange={setGenres} columns={2} />
        </div>

```
(delete this whole block, keep the `{error && ...}` paragraph that follows it).

Replace the load button handler:
```tsx
          onClick={() => onLoadLibrary(profile.trim(), backlog, multiplayer, genres)}
```
with:
```tsx
          onClick={() => onLoadLibrary(profile.trim(), backlog, multiplayer)}
```

- [ ] **Step 2: Update `SoloHome` to match the new signature**

In `src/components/solo/SoloHome.tsx`, replace:
```tsx
type Screen =
  | { name: "settings" }
  | { name: "swipe"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter; genres: string[] }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };

export function SoloHome() {
  const [screen, setScreen] = useState<Screen>({ name: "settings" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadLibrary(
    profile: string,
    backlog: BacklogFilter,
    multiplayer: MultiplayerFilter,
    genres: string[],
  ) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/steam/library?profile=${encodeURIComponent(profile)}`);
      const data = (await res.json()) as { games?: SteamOwnedGame[]; error?: string };
      if (!res.ok || !data.games) {
        setError(data.error ?? "Nie udało się wczytać biblioteki.");
        setLoading(false);
        return;
      }
      const filtered = filterByPlaytime(data.games, backlog);
      if (filtered.length === 0) {
        setError("Brak gier pasujących do tego filtra.");
        setLoading(false);
        return;
      }
      setScreen({ name: "swipe", pool: shuffleGames(filtered), multiplayer, genres });
      setLoading(false);
    } catch {
      setError("Coś poszło nie tak. Spróbuj ponownie.");
      setLoading(false);
    }
  }

  if (screen.name === "swipe") {
    return (
      <SoloSwipeScreen
        pool={screen.pool}
        multiplayerFilter={screen.multiplayer}
        genreFilter={screen.genres}
        onExit={() => setScreen({ name: "settings" })}
        onViewLiked={() => setScreen({ name: "liked" })}
      />
    );
  }
```
with:
```tsx
type Screen =
  | { name: "settings" }
  | { name: "swipe"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };

export function SoloHome() {
  const [screen, setScreen] = useState<Screen>({ name: "settings" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadLibrary(profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/steam/library?profile=${encodeURIComponent(profile)}`);
      const data = (await res.json()) as { games?: SteamOwnedGame[]; error?: string };
      if (!res.ok || !data.games) {
        setError(data.error ?? "Nie udało się wczytać biblioteki.");
        setLoading(false);
        return;
      }
      const filtered = filterByPlaytime(data.games, backlog);
      if (filtered.length === 0) {
        setError("Brak gier pasujących do tego filtra.");
        setLoading(false);
        return;
      }
      setScreen({ name: "swipe", pool: shuffleGames(filtered), multiplayer });
      setLoading(false);
    } catch {
      setError("Coś poszło nie tak. Spróbuj ponownie.");
      setLoading(false);
    }
  }

  if (screen.name === "swipe") {
    return (
      <SoloSwipeScreen
        pool={screen.pool}
        multiplayerFilter={screen.multiplayer}
        onExit={() => setScreen({ name: "settings" })}
        onViewLiked={() => setScreen({ name: "liked" })}
      />
    );
  }
```

- [ ] **Step 3: Add local genre state + `GenreFilterBar` to `SoloSwipeScreen`**

In `src/components/solo/SoloSwipeScreen.tsx`, add the import:
```tsx
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
```
becomes:
```tsx
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { GenreFilterBar } from "@/components/swipe/GenreFilterBar";
```

Replace the props type and remove `genreFilter` as a prop:
```tsx
export function SoloSwipeScreen({
  pool,
  multiplayerFilter,
  genreFilter,
  onExit,
  onViewLiked,
}: {
  pool: SteamOwnedGame[];
  multiplayerFilter: MultiplayerFilter;
  genreFilter: string[];
  onExit: () => void;
  onViewLiked: () => void;
}) {
  const router = useRouter();
  const cursorRef = useRef(0);
```
with:
```tsx
export function SoloSwipeScreen({
  pool,
  multiplayerFilter,
  onExit,
  onViewLiked,
}: {
  pool: SteamOwnedGame[];
  multiplayerFilter: MultiplayerFilter;
  onExit: () => void;
  onViewLiked: () => void;
}) {
  const router = useRouter();
  const [genreFilter, setGenreFilter] = useState<string[]>([]);
  const cursorRef = useRef(0);
```

(`useState` is already imported in this file alongside `useEffect`/`useRef`.)

Insert the filter bar into the JSX, right before the card area. Replace:
```tsx
      {upgradeError && <p className="text-pass text-sm">{upgradeError}</p>}

      <div className="min-h-0 flex-1 lg:flex lg:flex-col lg:justify-center">
```
with:
```tsx
      {upgradeError && <p className="text-pass text-sm">{upgradeError}</p>}

      <GenreFilterBar value={genreFilter} onChange={setGenreFilter} />

      <div className="min-h-0 flex-1 lg:flex lg:flex-col lg:justify-center">
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: succeeds — no leftover references to the removed `genres`/`genreFilter` props anywhere.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open `http://localhost:3000`, load a real Steam library (or use an existing test profile). Confirm: no gatunek picker on the settings screen; once in swipe view, a horizontally-scrollable genre pill row appears above the card; toggling a genre doesn't change the currently-shown card, but the next card (after swipe) respects the new filter.

- [ ] **Step 6: Commit**

```bash
git add src/components/solo/SoloSettingsScreen.tsx src/components/solo/SoloHome.tsx src/components/solo/SoloSwipeScreen.tsx
git commit -m "refactor: przenies filtr gatunkow solo z ekranu ustawien na ekran swipe"
```

---

## Task 4: Room — move genre filter onto the swipe screen, synced live

**Files:**
- Modify: `src/components/room/RoomExploreScreen.tsx`

**Interfaces:**
- Consumes: `setExploreGenreFilter`, `subscribeToExploreGenreFilter` (Task 2), `GenreFilterBar` (Task 1).

- [ ] **Step 1: Remove genre chips from the pre-start screen, subscribe to synced state**

Replace the imports:
```tsx
import { MultiToggleChip } from "@/components/ui/MultiToggleChip";
import { ToggleChip } from "@/components/ui/ToggleChip";
import {
  computeSharedLibrary,
  matchesGenreFilter,
  matchesMultiplayerFilter,
  GENRE_OPTIONS,
  type MultiplayerFilter,
} from "@/lib/steamLibrary";
import { subscribeToParticipants, likeGame, type Participant } from "@/lib/rooms";
```
with:
```tsx
import { ToggleChip } from "@/components/ui/ToggleChip";
import { GenreFilterBar } from "@/components/swipe/GenreFilterBar";
import {
  computeSharedLibrary,
  matchesGenreFilter,
  matchesMultiplayerFilter,
  type MultiplayerFilter,
} from "@/lib/steamLibrary";
import {
  subscribeToParticipants,
  likeGame,
  setExploreGenreFilter,
  subscribeToExploreGenreFilter,
  type Participant,
} from "@/lib/rooms";
```

Replace the state declarations and add a genre subscription effect. Replace:
```tsx
  const { participantId } = useParticipant(roomCode);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("multi");
  const [genres, setGenres] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const cursorRef = useRef(0);
  const poolRef = useRef<number[]>([]);

  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);
```
with:
```tsx
  const { participantId } = useParticipant(roomCode);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("multi");
  const [genres, setGenres] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const cursorRef = useRef(0);
  const poolRef = useRef<number[]>([]);

  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);
  // Filtr gatunku żyje w rooms/{roomCode}/session/state -- każdy gracz
  // subskrybuje na żywo i może pisać, zob. Task 2 (rooms.ts).
  useEffect(() => subscribeToExploreGenreFilter(roomCode, setGenres), [roomCode]);

  function handleGenreChange(next: string[]) {
    setGenres(next);
    setExploreGenreFilter(roomCode, next);
  }
```

Remove the genre chips from the "not started" screen. Replace:
```tsx
            <p className="text-text-secondary mt-4 text-sm">Wspólna biblioteka: {shared.length} gier</p>
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Jak chcecie grać?</p>
              <ToggleChip value={multiplayer} options={MULTIPLAYER_OPTIONS} onChange={setMultiplayer} columns={3} />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Jaki gatunek?</p>
              <MultiToggleChip value={genres} options={GENRE_OPTIONS} onChange={setGenres} columns={2} />
            </div>
            <button
```
with:
```tsx
            <p className="text-text-secondary mt-4 text-sm">Wspólna biblioteka: {shared.length} gier</p>
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Jak chcecie grać?</p>
              <ToggleChip value={multiplayer} options={MULTIPLAYER_OPTIONS} onChange={setMultiplayer} columns={3} />
            </div>
            <button
```

- [ ] **Step 2: Render the synced `GenreFilterBar` on the swipe screen**

Replace:
```tsx
        <Link href={`/room/${roomCode}/liked`} className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground">
          ❤️ Polubione
        </Link>
      </div>

      <div className="min-h-0 flex-1 lg:flex lg:flex-col lg:justify-center">
```
with:
```tsx
        <Link href={`/room/${roomCode}/liked`} className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground">
          ❤️ Polubione
        </Link>
      </div>

      <GenreFilterBar value={genres} onChange={handleGenreChange} />

      <div className="min-h-0 flex-1 lg:flex lg:flex-col lg:justify-center">
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification (two browsers/tabs)**

Run `npm run dev`, join the same room from two browser tabs (two participant IDs). Start Explore in one tab, confirm the genre bar appears above the card. Toggle a genre chip in tab A — confirm it updates live in tab B (Firestore `onSnapshot`), and vice versa. Confirm the currently-shown card in either tab doesn't change when the filter changes, only future cards.

- [ ] **Step 5: Commit**

```bash
git add src/components/room/RoomExploreScreen.tsx
git commit -m "refactor: przenies filtr gatunkow pokoju na ekran swipe, sync przez session/state"
```

---

## Task 5: `steam.ts` — Steam catalog discovery (pure parsing, TDD)

**Files:**
- Modify: `src/lib/steam.ts`
- Test: `src/lib/steam.test.ts`

**Interfaces:**
- Produces: `GENRE_TAG_IDS: Record<string, number>`, `parseDiscoverAppIds(resultsHtml: string): number[]`, `fetchDiscoverPage(tagIds: number[], start: number): Promise<{ appIds: number[]; hasMore: boolean }>`.

Verified live against Steam (2026-07-16, `l=polish` locale, matching this project's existing convention):
- `https://store.steampowered.com/search/results/?query&start=0&count=25&infinite=1&l=polish[&tags=<id,id>]` returns `{ success, results_html, total_count, start }` — `results_html` is a raw HTML fragment (not JSON), each result is an `<a data-ds-appid="NNN" ...>`.
- `https://store.steampowered.com/tagdata/populartags/polish` returns the official `{tagid, name}` list Steam itself uses — this resolved every `GENRE_OPTIONS` value to a real tag ID (Steam's tag names for Strategie/Symulacje are phrased "Strategiczne"/"Symulatory", but the IDs are the correct match, confirmed by manually checking `tags=9` and `tags=599` return strategy/simulation games).
- A plain regex (`data-ds-appid="(\d+)"`) reliably extracts every app ID from `results_html` — no HTML parser dependency needed.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/steam.test.ts` (new `describe` block, keep existing `parseSteamAppDetails` tests untouched):

```ts
import { parseDiscoverAppIds } from "./steam";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: FAIL — `parseDiscoverAppIds` is not exported from `./steam`.

- [ ] **Step 3: Implement `GENRE_TAG_IDS`, `parseDiscoverAppIds`, `fetchDiscoverPage`**

Append to the end of `src/lib/steam.ts`:

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: PASS, all tests including the pre-existing `parseSteamAppDetails` suite.

- [ ] **Step 5: Commit**

```bash
git add src/lib/steam.ts src/lib/steam.test.ts
git commit -m "feat: parsowanie katalogu Steam (Odkrywaj) - GENRE_TAG_IDS, parseDiscoverAppIds, fetchDiscoverPage"
```

---

## Task 6: `/api/steam/discover` route

**Files:**
- Create: `src/app/api/steam/discover/route.ts`

**Interfaces:**
- Consumes: `fetchDiscoverPage`, `GENRE_TAG_IDS` (Task 5).
- Produces: `GET /api/steam/discover?genres=<comma-separated GENRE_OPTIONS values>&start=<n>` → `{ appIds: number[], hasMore: boolean }` or `{ error: string }`.
- Deliberately has NO `excludeAppIds` param — excluding already-owned games happens client-side (Task 7/9) where the exclude set already lives, keeping this route a thin, single-purpose proxy like `search`/`details`/`library`.

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { fetchDiscoverPage, GENRE_TAG_IDS } from "@/lib/steam";

export async function GET(request: NextRequest) {
  const genresParam = request.nextUrl.searchParams.get("genres") ?? "";
  const startParam = request.nextUrl.searchParams.get("start") ?? "0";
  const start = Number(startParam);
  if (!Number.isInteger(start) || start < 0) {
    return NextResponse.json({ error: "Podaj poprawny start." }, { status: 400 });
  }

  const tagIds = genresParam
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => GENRE_TAG_IDS[g])
    .filter((id): id is number => id !== undefined);

  try {
    const page = await fetchDiscoverPage(tagIds, start);
    return NextResponse.json(page);
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać katalogu ze Steam." }, { status: 502 });
  }
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification against the real Steam endpoint**

Run `npm run dev`, then in a separate terminal:

```bash
curl "http://localhost:3000/api/steam/discover?genres=RPG&start=0"
```

Expected: JSON with `appIds` (25 numbers) and `hasMore: true`. Spot-check 2-3 of the returned app IDs on `store.steampowered.com/app/<id>` to confirm they're plausible RPGs (server-side tag filtering is an optimization, not the correctness guarantee — but it should visibly narrow results, not return random genres).

```bash
curl "http://localhost:3000/api/steam/discover?genres=&start=0"
```

Expected: `appIds` full of current best-selling titles (no genre filter), `hasMore: true`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/steam/discover/route.ts
git commit -m "feat: endpoint /api/steam/discover - katalog Steam jako trzecie zrodlo Explore"
```

---

## Task 7: Solo — "Cały katalog" as a source option

**Files:**
- Modify: `src/components/solo/SoloSettingsScreen.tsx`
- Modify: `src/components/solo/SoloHome.tsx`
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

**Interfaces:**
- Produces: `SoloSettingsScreen`'s `onLoadLibrary` gains a leading `source: "library" | "catalog"` argument; profile becomes optional when `source === "catalog"`. `SoloSwipeScreen`'s props become a discriminated union on `source`.

- [ ] **Step 1: Add the source toggle to `SoloSettingsScreen`**

Add a new `SOURCE_OPTIONS` constant near `BACKLOG_OPTIONS`/`MULTIPLAYER_OPTIONS`:

```tsx
const SOURCE_OPTIONS: { value: "library" | "catalog"; label: string }[] = [
  { value: "library", label: "Twoja biblioteka" },
  { value: "catalog", label: "Cały katalog Steam" },
];
```

Add `source` state and update the `onLoadLibrary` prop type:
```tsx
  onLoadLibrary: (profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) => void;
```
becomes:
```tsx
  onLoadLibrary: (source: "library" | "catalog", profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) => void;
```

Right after `const [profile, setProfile] = useState("");`, add:
```tsx
  const [source, setSource] = useState<"library" | "catalog">("library");
```

Insert the source toggle right after the intro `<p>` and before the "Twój profil Steam" block:
```tsx
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">Twój profil Steam</span>
```
becomes:
```tsx
        <div className="mb-5">
          <ToggleChip value={source} options={SOURCE_OPTIONS} onChange={setSource} columns={2} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            Twój profil Steam {source === "catalog" && "(opcjonalnie)"}
          </span>
```

Hide the backlog filter in catalog mode (meaningless without a personal library) — wrap it in a condition:
```tsx
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-foreground">Które gry pokazywać?</p>
          <ToggleChip value={backlog} options={BACKLOG_OPTIONS} onChange={setBacklog} columns={2} />
        </div>
```
becomes:
```tsx
        {source === "library" && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-foreground">Które gry pokazywać?</p>
            <ToggleChip value={backlog} options={BACKLOG_OPTIONS} onChange={setBacklog} columns={2} />
          </div>
        )}
```

Update the load button:
```tsx
        <button
          type="button"
          disabled={loading || !profile.trim()}
          onClick={() => onLoadLibrary(profile.trim(), backlog, multiplayer)}
          className="bg-accent-brand mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
        >
          {loading ? "Wczytuję…" : "Wczytaj bibliotekę"}
        </button>
```
becomes:
```tsx
        <button
          type="button"
          disabled={loading || (source === "library" && !profile.trim())}
          onClick={() => onLoadLibrary(source, profile.trim(), backlog, multiplayer)}
          className="bg-accent-brand mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
        >
          {loading ? "Wczytuję…" : source === "catalog" ? "Przeglądaj katalog" : "Wczytaj bibliotekę"}
        </button>
```

- [ ] **Step 2: Branch `SoloHome.handleLoadLibrary` on source**

Replace the `Screen` type and `handleLoadLibrary`:
```tsx
type Screen =
  | { name: "settings" }
  | { name: "swipe"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };

export function SoloHome() {
  const [screen, setScreen] = useState<Screen>({ name: "settings" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadLibrary(profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/steam/library?profile=${encodeURIComponent(profile)}`);
      const data = (await res.json()) as { games?: SteamOwnedGame[]; error?: string };
      if (!res.ok || !data.games) {
        setError(data.error ?? "Nie udało się wczytać biblioteki.");
        setLoading(false);
        return;
      }
      const filtered = filterByPlaytime(data.games, backlog);
      if (filtered.length === 0) {
        setError("Brak gier pasujących do tego filtra.");
        setLoading(false);
        return;
      }
      setScreen({ name: "swipe", pool: shuffleGames(filtered), multiplayer });
      setLoading(false);
    } catch {
      setError("Coś poszło nie tak. Spróbuj ponownie.");
      setLoading(false);
    }
  }

  if (screen.name === "swipe") {
    return (
      <SoloSwipeScreen
        pool={screen.pool}
        multiplayerFilter={screen.multiplayer}
        onExit={() => setScreen({ name: "settings" })}
        onViewLiked={() => setScreen({ name: "liked" })}
      />
    );
  }
```
with:
```tsx
type Screen =
  | { name: "settings" }
  | { name: "swipe"; source: "library"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter }
  | { name: "swipe"; source: "catalog"; excludeAppIds: number[]; multiplayer: MultiplayerFilter }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };

export function SoloHome() {
  const [screen, setScreen] = useState<Screen>({ name: "settings" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadLibrary(
    source: "library" | "catalog",
    profile: string,
    backlog: BacklogFilter,
    multiplayer: MultiplayerFilter,
  ) {
    setLoading(true);
    setError(null);
    try {
      if (!profile) {
        // Katalog bez profilu -- nic do wykluczenia, prosto do Explore.
        setScreen({ name: "swipe", source: "catalog", excludeAppIds: [], multiplayer });
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/steam/library?profile=${encodeURIComponent(profile)}`);
      const data = (await res.json()) as { games?: SteamOwnedGame[]; error?: string };
      if (!res.ok || !data.games) {
        setError(data.error ?? "Nie udało się wczytać biblioteki.");
        setLoading(false);
        return;
      }

      if (source === "catalog") {
        setScreen({ name: "swipe", source: "catalog", excludeAppIds: data.games.map((g) => g.steamAppId), multiplayer });
        setLoading(false);
        return;
      }

      const filtered = filterByPlaytime(data.games, backlog);
      if (filtered.length === 0) {
        setError("Brak gier pasujących do tego filtra.");
        setLoading(false);
        return;
      }
      setScreen({ name: "swipe", source: "library", pool: shuffleGames(filtered), multiplayer });
      setLoading(false);
    } catch {
      setError("Coś poszło nie tak. Spróbuj ponownie.");
      setLoading(false);
    }
  }

  if (screen.name === "swipe" && screen.source === "library") {
    return (
      <SoloSwipeScreen
        source="library"
        pool={screen.pool}
        multiplayerFilter={screen.multiplayer}
        onExit={() => setScreen({ name: "settings" })}
        onViewLiked={() => setScreen({ name: "liked" })}
      />
    );
  }

  if (screen.name === "swipe" && screen.source === "catalog") {
    return (
      <SoloSwipeScreen
        source="catalog"
        excludeAppIds={screen.excludeAppIds}
        multiplayerFilter={screen.multiplayer}
        onExit={() => setScreen({ name: "settings" })}
        onViewLiked={() => setScreen({ name: "liked" })}
      />
    );
  }
```

- [ ] **Step 3: Make `SoloSwipeScreen` accept both sources, paginate the catalog**

Replace the props type and the first part of the component:
```tsx
export function SoloSwipeScreen({
  pool,
  multiplayerFilter,
  onExit,
  onViewLiked,
}: {
  pool: SteamOwnedGame[];
  multiplayerFilter: MultiplayerFilter;
  onExit: () => void;
  onViewLiked: () => void;
}) {
  const router = useRouter();
  const [genreFilter, setGenreFilter] = useState<string[]>([]);
  const cursorRef = useRef(0);
```
with:
```tsx
type SoloSwipeProps =
  | { source: "library"; pool: SteamOwnedGame[]; multiplayerFilter: MultiplayerFilter; onExit: () => void; onViewLiked: () => void }
  | { source: "catalog"; excludeAppIds: number[]; multiplayerFilter: MultiplayerFilter; onExit: () => void; onViewLiked: () => void };

export function SoloSwipeScreen(props: SoloSwipeProps) {
  const { multiplayerFilter, onExit, onViewLiked } = props;
  const router = useRouter();
  const [genreFilter, setGenreFilter] = useState<string[]>([]);
  const cursorRef = useRef(0);
  const poolRef = useRef<number[]>(props.source === "library" ? props.pool.map((g) => g.steamAppId) : []);
  const discoverStartRef = useRef(0);
  const discoverExhaustedRef = useRef(props.source === "library");
  const excludeSetRef = useRef(new Set<number>(props.source === "catalog" ? props.excludeAppIds : []));
```

`advance()` currently indexes `pool[cursorRef.current]` directly (a fixed array) — switch it to `poolRef.current`, and add the catalog pagination branch when the ref is exhausted. Replace:
```tsx
  async function advance() {
    setLoadingCard(true);
    while (cursorRef.current < pool.length) {
      const candidate = pool[cursorRef.current];
      cursorRef.current += 1;
      try {
        const res = await fetch(`/api/steam/details?appid=${candidate.steamAppId}`);
```
with:
```tsx
  async function fetchNextDiscoverPage() {
    const genresParam = genreFilter.join(",");
    const res = await fetch(`/api/steam/discover?genres=${encodeURIComponent(genresParam)}&start=${discoverStartRef.current}`);
    if (!res.ok) return null;
    return (await res.json()) as { appIds: number[]; hasMore: boolean };
  }

  async function advance() {
    setLoadingCard(true);
    while (true) {
      if (cursorRef.current >= poolRef.current.length) {
        if (discoverExhaustedRef.current) break;
        const page = await fetchNextDiscoverPage();
        if (!page) {
          discoverExhaustedRef.current = true;
          break;
        }
        discoverStartRef.current += page.appIds.length;
        if (!page.hasMore) discoverExhaustedRef.current = true;
        const fresh = page.appIds.filter((id) => !excludeSetRef.current.has(id));
        poolRef.current.push(...fresh);
        continue;
      }
      const candidate = poolRef.current[cursorRef.current];
      cursorRef.current += 1;
      try {
        const res = await fetch(`/api/steam/details?appid=${candidate}`);
```

The rest of the `try` block (fetching `appdetails`, `matchesMultiplayerFilter`/`matchesGenreFilter`, building `currentCard`) stays exactly as-is — it already reads `data.steamAppId` from the response body, not from `candidate`, so no further change needed there. Only the closing of the `while` loop needs updating (it currently references `pool.length` in the loading fallback comment area — no code change needed there since the loop condition itself moved to `while (true)` with explicit `break`s above).

Hide the "Co-op / Dodaj znajomego" upgrade flow for catalog mode (it depends on a concrete owned-games pool). Replace:
```tsx
        <button
          type="button"
          onClick={() => setShowUpgrade((v) => !v)}
          className="bg-secondary rounded-full px-4 py-2 text-xs font-bold text-foreground"
        >
          Co-op / Dodaj znajomego
        </button>
      </div>

      {showUpgrade && (
```
with:
```tsx
        {props.source === "library" && (
          <button
            type="button"
            onClick={() => setShowUpgrade((v) => !v)}
            className="bg-secondary rounded-full px-4 py-2 text-xs font-bold text-foreground"
          >
            Co-op / Dodaj znajomego
          </button>
        )}
      </div>

      {props.source === "library" && showUpgrade && (
```

And `handleUpgradeToCoop` reads `pool.map(...)` — replace:
```tsx
      const appIds = pool.map((g) => g.steamAppId);
```
with:
```tsx
      if (props.source !== "library") return;
      const appIds = props.pool.map((g) => g.steamAppId);
```

Update the header title:
```tsx
        <h1 className="font-heading text-[18px] font-bold text-foreground">Twoja biblioteka</h1>
```
becomes:
```tsx
        <h1 className="font-heading text-[18px] font-bold text-foreground">
          {props.source === "library" ? "Twoja biblioteka" : "Cały katalog Steam"}
        </h1>
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: succeeds. Pay attention to the `showUpgrade`/`upgradeNickname`/etc. state — they stay declared unconditionally (only their *rendering* and the appIds line are gated on `props.source === "library"`), so no unused-variable errors.

- [ ] **Step 5: Run existing tests**

Run: `npx vitest run`
Expected: PASS (this task touches no pure-logic files covered by existing suites, but confirms nothing else broke).

- [ ] **Step 6: Manual verification**

Run `npm run dev`. On the solo settings screen: toggle to "Cały katalog Steam", confirm profile field label shows "(opcjonalnie)" and the backlog picker disappears, confirm the load button is enabled without a profile. Click through — confirm cards load from the catalog (variety of games, not just your library), swiping through ~30 cards should trigger at least one automatic pagination fetch (no visible glitch beyond the normal "Szukam kolejnej gry…" state). Then repeat with a real profile pasted in catalog mode — confirm none of your already-owned games appear.

- [ ] **Step 7: Commit**

```bash
git add src/components/solo/SoloSettingsScreen.tsx src/components/solo/SoloHome.tsx src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: cala katalog Steam jako trzecie zrodlo Explore solo (Odkrywaj)"
```

---

## Task 8: Room — "Cały katalog" as a source option

**Files:**
- Modify: `src/components/room/RoomExploreScreen.tsx`

**Interfaces:**
- Consumes: `/api/steam/discover` (Task 6). Reads `steamLibraryAppIds` off the current participant's own `Participant` record (already fetched by `subscribeToParticipants`) to build the exclude set — never the room's combined library, per spec.

- [ ] **Step 1: Add the source toggle and discover pagination refs**

Add a `SOURCE_OPTIONS` constant near `MULTIPLAYER_OPTIONS`:
```tsx
const SOURCE_OPTIONS: { value: "shared" | "catalog"; label: string }[] = [
  { value: "shared", label: "Wspólna biblioteka" },
  { value: "catalog", label: "Cały katalog Steam" },
];
```

Add source state and pagination refs alongside the existing ones:
```tsx
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("multi");
  const [genres, setGenres] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const cursorRef = useRef(0);
  const poolRef = useRef<number[]>([]);
```
becomes:
```tsx
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("multi");
  const [genres, setGenres] = useState<string[]>([]);
  const [source, setSource] = useState<"shared" | "catalog">("shared");
  const [started, setStarted] = useState(false);
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const cursorRef = useRef(0);
  const poolRef = useRef<number[]>([]);
  const discoverStartRef = useRef(0);
  const discoverExhaustedRef = useRef(false);
  const excludeSetRef = useRef<Set<number>>(new Set());
```

- [ ] **Step 2: Rewrite `advance()` to paginate the catalog when `source === "catalog"`**

Replace:
```tsx
  async function advance() {
    setLoadingCard(true);
    while (cursorRef.current < poolRef.current.length) {
      const steamAppId = poolRef.current[cursorRef.current];
      cursorRef.current += 1;
      try {
```
with:
```tsx
  async function fetchNextDiscoverPage() {
    const genresParam = genres.join(",");
    const res = await fetch(`/api/steam/discover?genres=${encodeURIComponent(genresParam)}&start=${discoverStartRef.current}`);
    if (!res.ok) return null;
    return (await res.json()) as { appIds: number[]; hasMore: boolean };
  }

  async function advance() {
    setLoadingCard(true);
    while (true) {
      if (cursorRef.current >= poolRef.current.length) {
        if (source !== "catalog" || discoverExhaustedRef.current) break;
        const page = await fetchNextDiscoverPage();
        if (!page) {
          discoverExhaustedRef.current = true;
          break;
        }
        discoverStartRef.current += page.appIds.length;
        if (!page.hasMore) discoverExhaustedRef.current = true;
        const fresh = page.appIds.filter((id) => !excludeSetRef.current.has(id));
        poolRef.current.push(...fresh);
        continue;
      }
      const steamAppId = poolRef.current[cursorRef.current];
      cursorRef.current += 1;
      try {
```

The rest of the `try` body (fetch `/api/steam/details`, `matchesMultiplayerFilter`/`matchesGenreFilter`, `setCurrentCard`) is unchanged.

- [ ] **Step 3: Wire `handleStart` to branch on source**

Replace:
```tsx
  function handleStart() {
    poolRef.current = shared;
    cursorRef.current = 0;
    setExhausted(false);
    setStarted(true);
    advance();
  }
```
with:
```tsx
  function handleStart() {
    cursorRef.current = 0;
    discoverStartRef.current = 0;
    discoverExhaustedRef.current = source !== "catalog";
    if (source === "shared") {
      poolRef.current = shared;
    } else {
      poolRef.current = [];
      const me = participants.find((p) => p.participantId === participantId);
      excludeSetRef.current = new Set(me?.steamLibraryAppIds ?? []);
    }
    setExhausted(false);
    setStarted(true);
    advance();
  }
```

- [ ] **Step 4: Add the source toggle to the pre-start screen, relax the "za mało uczestników" gate**

Replace:
```tsx
        {shared.length === 0 ? (
          <p className="text-text-secondary mt-6 text-center text-sm">
            Za mało uczestników z podpiętym Steamem, żeby policzyć wspólną bibliotekę.
          </p>
        ) : (
          <>
            <p className="text-text-secondary mt-4 text-sm">Wspólna biblioteka: {shared.length} gier</p>
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Jak chcecie grać?</p>
              <ToggleChip value={multiplayer} options={MULTIPLAYER_OPTIONS} onChange={setMultiplayer} columns={3} />
            </div>
            <button
              type="button"
              onClick={handleStart}
              className="bg-accent-brand mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
            >
              Zacznij przeglądać
            </button>
          </>
        )}
```
with:
```tsx
        <div className="mt-4">
          <ToggleChip value={source} options={SOURCE_OPTIONS} onChange={setSource} columns={2} />
        </div>

        {source === "shared" && shared.length === 0 ? (
          <p className="text-text-secondary mt-6 text-center text-sm">
            Za mało uczestników z podpiętym Steamem, żeby policzyć wspólną bibliotekę.
          </p>
        ) : (
          <>
            {source === "shared" && (
              <p className="text-text-secondary mt-4 text-sm">Wspólna biblioteka: {shared.length} gier</p>
            )}
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Jak chcecie grać?</p>
              <ToggleChip value={multiplayer} options={MULTIPLAYER_OPTIONS} onChange={setMultiplayer} columns={3} />
            </div>
            <button
              type="button"
              onClick={handleStart}
              className="bg-accent-brand mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
            >
              Zacznij przeglądać
            </button>
          </>
        )}
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual verification (two tabs)**

Run `npm run dev`, join the same room from two tabs, both with Steam profiles attached. In tab A, switch source to "Cały katalog Steam", start Explore, confirm cards come from the wider catalog and exclude tab A's own owned games (not tab B's). Toggle back to "Wspólna biblioteka" and confirm the old flow still works unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/room/RoomExploreScreen.tsx
git commit -m "feat: caly katalog Steam jako trzecie zrodlo Explore w pokoju (Odkrywaj)"
```

---

## Task 9: Full regression pass + deploy

**Files:** none (verification + deploy only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds with zero type errors across the whole project.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all suites pass, including the new `parseDiscoverAppIds` tests from Task 5 and every pre-existing suite (`elimination`, `history`, `localLiked`, `packages`, `plinko`, `releaseCountdown`, `steam`, `steamImages`, `steamLibrary`, `swipeGesture`).

- [ ] **Step 3: Manual smoke test of both old paths (regression)**

Run `npm run dev`. Confirm unaffected by this plan:
- Old manual pool + eliminacja rundowa (`/room/[code]/pool` → `/room/[code]/swipe`) still works end-to-end.
- Solo Wersus (Polubione → Versus) still works.
- Room Wersus still works.
- Coinflip/Koło/Plinko mini-games still work (their `session/state` fields must be untouched by the new `exploreGenreFilter` field — confirmed by Task 2 always using `{ merge: true }` on a single field).

- [ ] **Step 4: Push to trigger Vercel auto-deploy**

```bash
git push origin master
```

Expected: push succeeds, no conflicts (branch was up to date with `origin/master` at the start of this session).

- [ ] **Step 5: Verify the live deploy**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tumolec.vercel.app
```
Expected: `200`. Then manually open `https://tumolec.vercel.app` and spot-check: solo settings screen shows the library/catalog toggle and no genre picker; starting a solo library swipe shows the genre bar above the card.

- [ ] **Step 6: Update the vault**

This is a code-plan step reminder, not a git commit: after deploy is confirmed, update `work/active/Tumolec.md` roadmap (mark Explore v2's three feedback items as done, replacing the "⏸️ do zaplanowania" line) and `work/active/Explore v2 — feedback do zaplanowania.md` (mark resolved or archive), per this vault's own session-end convention.
