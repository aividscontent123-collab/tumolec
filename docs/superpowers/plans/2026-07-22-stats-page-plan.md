# Tumolec — Faza C, kawałek 2: Strony Statystyki — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Statystyki" screen for both room and solo mode, showing total Versus wins, top winning games, favorite genres, total HowLongToBeat hours, and recent activity — derived from existing data plus one new timestamp field (room) and one new localStorage log (solo).

**Architecture:** A pure computation module (`lib/stats.ts`, following the `lib/elimination.ts`/`lib/history.ts` convention) turns a list of win events + Steam cache lookups + liked-game appids into a `Stats` object. Room mode feeds it from `eliminationRounds` (a new `finishedAt` timestamp is added there) and the existing `liked` subcollection. Solo mode feeds it from a new `lib/localVersusHistory.ts` localStorage log (the only durable state solo has today is the liked list — Versus results currently live only in React state and vanish on refresh).

**Tech Stack:** Next.js 16 (App Router), TypeScript, Firebase Firestore (client SDK), Vitest, Tailwind v4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-22-stats-page-design.md`

## Global Constraints

- No new npm dependencies (no charting library — activity is shown as text/numbers, per spec).
- `firestore.rules` deploys require **explicit user approval** before running `firebase deploy --only firestore:rules`, and must be followed by **live Playwright verification**, not just a clean rules compile (this project has twice shipped a rules gap that only live testing caught — HLTB and tie-breaker fields, both 2026-07-18).
- Pure logic (`lib/stats.ts`) gets full Vitest coverage. Thin Firestore/localStorage read-write wrappers (`finishRound`, `lib/localVersusHistory.ts`) follow this codebase's existing convention of staying untested (see `lib/rooms.ts` writers, `lib/localLiked.ts`) — verified instead by `tsc`/build and, at the end, live Playwright runs.
- Follow existing file conventions exactly: Polish UI copy, `"use client"` at the top of client components, `@/` path alias, Tailwind utility classes matching sibling screens (`HistoryScreen.tsx`, `SoloLikedScreen.tsx`).

---

### Task 1: Room — `finishedAt` timestamp on elimination rounds

**Files:**
- Modify: `src/lib/rooms.ts:215-222` (the `RoundDoc` type)
- Modify: `src/lib/rooms.ts:312-317` (the `finishRound` function)

**Interfaces:**
- Consumes: nothing new (`Timestamp`, `serverTimestamp` already imported in this file).
- Produces: `RoundDoc.finishedAt?: Timestamp | null` — Task 6/7 read this via `round.finishedAt?.toMillis?.() ?? null` when building win events for `computeStats`.

- [ ] **Step 1: Add `finishedAt` to the `RoundDoc` type**

Replace the existing type (`src/lib/rooms.ts:215-222`):

```ts
export type RoundDoc = {
  roundNumber: number;
  poolAtStart: number[];
  status: "voting" | "finished";
  survivors: number[] | null;
  sessionId: string;
  tieBreak?: TieBreakState;
  finishedAt?: Timestamp | null;
};
```

- [ ] **Step 2: Stamp `finishedAt` when a round closes**

Replace `finishRound` (`src/lib/rooms.ts:312-317`):

```ts
/** Zamyka rundę z policzonym wynikiem. Wywoływane przez KTÓRYKOLWIEK klient,
 * który zauważy że wszyscy skończyli głosować -- bezpieczne przy wyścigu,
 * bo `survivors` to czysta funkcja tych samych danych (resolveRound), więc
 * każdy klient policzy identyczny wynik niezależnie od tego kto zapisze pierwszy.
 * `finishedAt` zasila statystyki aktywności w czasie -- zapisywane na KAŻDEJ
 * zamykanej rundzie (nie tylko finałowej), upraszcza kod; tylko finałowa
 * runda (1 ocalały) jest brana pod uwagę przy liczeniu Statystyk. */
export async function finishRound(roomCode: string, roundId: string, survivors: number[]) {
  await updateDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId), {
    status: "finished",
    survivors,
    finishedAt: serverTimestamp(),
  });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rooms.ts
git commit -m "feat: stamp finishedAt on elimination rounds for stats activity tracking"
```

---

### Task 2: Room — allow `finishedAt` in `firestore.rules` (file edit only, no deploy)

**Files:**
- Modify: `firestore.rules:64-68`

**Interfaces:**
- Consumes: nothing.
- Produces: rules text that Task 8 will deploy (with explicit user approval) once the whole feature is built.

- [ ] **Step 1: Add `finishedAt` to the allowed update keys and validate its type**

Replace the `eliminationRounds` `allow update` rule (`firestore.rules:64-68`):

```
        allow update: if request.resource.data.diff(resource.data)
          .affectedKeys().hasOnly(['status', 'survivors', 'tieBreak', 'finishedAt'])
          && request.resource.data.status in ['voting', 'finished']
          && (request.resource.data.get('survivors', null) is list || request.resource.data.get('survivors', null) == null)
          && (!('tieBreak' in request.resource.data) || request.resource.data.tieBreak is map)
          && (!('finishedAt' in request.resource.data) || request.resource.data.finishedAt is timestamp);
```

- [ ] **Step 2: Compile the rules locally (no deploy)**

Run: `npx firebase-tools deploy --only firestore:rules --dry-run 2>&1 || npx firebase-tools firestore:rules:release --help`

If `--dry-run` isn't available in the installed `firebase-tools` version, it's fine to skip local compilation here — the rules will be verified during the real deploy in Task 8, which is already gated behind explicit approval and live Playwright verification. Do not deploy in this task.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: allow finishedAt on elimination round updates in firestore.rules"
```

---

### Task 3: Solo — new `lib/localVersusHistory.ts` log module

**Files:**
- Create: `src/lib/localVersusHistory.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `VersusWin = { steamAppId: number; wonAt: number }`, `addVersusWin(current: VersusWin[], steamAppId: number): VersusWin[]`, `getLocalVersusHistory(): VersusWin[]`, `saveLocalVersusHistory(entries: VersusWin[]): void`. Task 4 calls `addVersusWin`/`getLocalVersusHistory`/`saveLocalVersusHistory`. Task 7 calls `getLocalVersusHistory`.

- [ ] **Step 1: Create the module**

```ts
"use client";

/** Log wygranych Versus w trybie solo -- localStorage, spójne z resztą trybu
 * solo (decyzje zostają w przeglądarce, zero Firestore). Odpowiednik
 * localLiked.ts, ale przechowuje też znacznik czasu -- solo dziś nie ma
 * ŻADNEJ trwałej historii Versus (wynik żyje tylko w pamięci komponentu),
 * więc to jedyny sposób, żeby solo miało cokolwiek do policzenia w
 * Statystykach. Logika (dopisywanie wpisu) jest czystą funkcją operującą na
 * tablicy -- testowalna bez DOM; localStorage get/set to cienkie,
 * nietestowane wrappery (konwencja tego repo, zob. localLiked.ts). */

const KEY = "tumolec:solo:versusHistory";

export type VersusWin = { steamAppId: number; wonAt: number };

export function addVersusWin(current: VersusWin[], steamAppId: number): VersusWin[] {
  return [...current, { steamAppId, wonAt: Date.now() }];
}

export function getLocalVersusHistory(): VersusWin[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VersusWin[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalVersusHistory(entries: VersusWin[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/localVersusHistory.ts
git commit -m "feat: add localStorage Versus win log for solo mode"
```

---

### Task 4: Solo — log a win when `LocalVersusScreen` gets a winner

**Files:**
- Modify: `src/components/solo/LocalVersusScreen.tsx`

**Interfaces:**
- Consumes: `addVersusWin`, `getLocalVersusHistory`, `saveLocalVersusHistory` from `@/lib/localVersusHistory` (Task 3).
- Produces: nothing new consumed elsewhere — this is the write site.

- [ ] **Step 1: Guard-write the win log when `winner` transitions from `null` to a value**

Replace the full file `src/components/solo/LocalVersusScreen.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useLocalVersus } from "@/lib/useLocalVersus";
import { addVersusWin, getLocalVersusHistory, saveLocalVersusHistory } from "@/lib/localVersusHistory";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { SoloTieBreaker } from "@/components/solo/SoloTieBreaker";
import { WinnerScreen } from "@/components/room/WinnerScreen";
import type { SwipeGame } from "@/lib/types";

/** Versus solo: bracket eliminacji na liście Polubionych, bez Firestore.
 * `games` to pełne dane (nie same appidy) -- SoloLikedScreen już je ma
 * wczytane, unikamy ponownego fetchowania /api/steam/details tutaj. */
export function LocalVersusScreen({ games, onExit }: { games: SwipeGame[]; onExit: () => void }) {
  const gameByAppId = new Map(games.map((g) => [g.steamAppId, g]));
  const { pool, deck, poolSize, winner, vote, tieBreak, startTieBreak, resolveTieBreak, restart } =
    useLocalVersus(games.map((g) => g.steamAppId));

  // Zapisz wpis do logu DOKŁADNIE RAZ na przejście null -> zwycięzca, nie przy
  // każdym renderze (winner zostaje ustawiony aż do restart()/reroll).
  const loggedWinnerRef = useRef<number | null>(null);
  useEffect(() => {
    if (winner !== null && loggedWinnerRef.current !== winner) {
      loggedWinnerRef.current = winner;
      saveLocalVersusHistory(addVersusWin(getLocalVersusHistory(), winner));
    }
    if (winner === null) {
      loggedWinnerRef.current = null;
    }
  }, [winner]);

  if (winner !== null) {
    return <WinnerScreen game={gameByAppId.get(winner)} onReroll={restart} />;
  }

  const currentGame = gameByAppId.get(deck[0]);
  if (!currentGame) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }

  const currentAppId = currentGame.steamAppId;
  function handleSwipe(direction: "left" | "right") {
    vote(currentAppId, direction);
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center gap-3 px-[22px] pt-[18px]">
        <button
          type="button"
          onClick={onExit}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <p className="text-text-secondary flex-1 text-center text-xs tracking-widest">
          GRA {poolSize - deck.length + 1} Z {poolSize}
        </p>
      </div>
      <main className="min-h-0 flex-1 px-[22px] pb-[18px] lg:flex lg:flex-col lg:justify-center">
        <GameDetailLayout key={currentGame.steamAppId} game={currentGame}>
          <SwipeCard
            key={currentGame.steamAppId}
            game={currentGame}
            onSwipe={tieBreak ? () => {} : handleSwipe}
          />
        </GameDetailLayout>
      </main>
      {poolSize === 2 && (
        <SoloTieBreaker
          candidates={[pool[0], pool[1]]}
          gameByAppId={gameByAppId}
          tieBreak={tieBreak}
          onChooseMethod={startTieBreak}
          onResolved={resolveTieBreak}
        />
      )}
      {!tieBreak && (
        <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/solo/LocalVersusScreen.tsx
git commit -m "feat: log solo Versus wins to localStorage history"
```

---

### Task 5: `lib/stats.ts` — pure stats computation (TDD)

**Files:**
- Create: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

**Interfaces:**
- Consumes: `SteamCacheEntry` type from `@/lib/steam` (already exists: `tags: string[]`, `hltbMainStory?: number | null`).
- Produces: `WinEvent = { steamAppId: number; wonAt: number | null }`, `Stats` type, `computeStats(wins: WinEvent[], cacheByAppId: Record<number, SteamCacheEntry | undefined>, likedAppIds: number[]): Stats`. Tasks 6 and 7 import `computeStats`, `Stats`, and `WinEvent` from `@/lib/stats`.

- [ ] **Step 1: Write the failing test file**

```ts
import { describe, expect, it } from "vitest";
import { computeStats, type WinEvent } from "./stats";
import type { SteamCacheEntry } from "./steam";

function cacheEntry(overrides: Partial<SteamCacheEntry>): SteamCacheEntry {
  return {
    name: "Test Game",
    headerImageUrl: "",
    steamUrl: "",
    shortDescription: "",
    reviewSummary: "",
    reviewScorePercent: 0,
    tags: [],
    genres: [],
    minRequirements: "",
    recRequirements: "",
    cachedAt: 0,
    developers: [],
    releaseDate: null,
    screenshots: [],
    trailerHlsUrl: null,
    trailerThumbnail: null,
    totalReviews: 0,
    topReviews: [],
    ...overrides,
  };
}

describe("computeStats", () => {
  it("returns zeroed stats for empty input", () => {
    expect(computeStats([], {}, [])).toEqual({
      totalWins: 0,
      topGames: [],
      topGenres: [],
      totalHltbHours: 0,
      activity: { last7days: 0, last30days: 0, mostActiveWeekday: null },
    });
  });

  it("counts total wins and ranks top games, breaking ties by steamAppId", () => {
    const wins: WinEvent[] = [
      { steamAppId: 10, wonAt: null },
      { steamAppId: 20, wonAt: null },
      { steamAppId: 10, wonAt: null },
      { steamAppId: 30, wonAt: null },
      { steamAppId: 20, wonAt: null },
    ];
    const stats = computeStats(wins, {}, []);
    expect(stats.totalWins).toBe(5);
    expect(stats.topGames).toEqual([
      { steamAppId: 10, wins: 2 },
      { steamAppId: 20, wins: 2 },
      { steamAppId: 30, wins: 1 },
    ]);
  });

  it("limits topGames to the top 5", () => {
    const wins: WinEvent[] = Array.from({ length: 7 }, (_, i) => ({ steamAppId: i + 1, wonAt: null }));
    const stats = computeStats(wins, {}, []);
    expect(stats.topGames).toHaveLength(5);
  });

  it("ranks genres from both wins and liked games, deduping by appid", () => {
    const wins: WinEvent[] = [{ steamAppId: 1, wonAt: null }];
    const cacheByAppId = {
      1: cacheEntry({ tags: ["RPG", "Indie"] }),
      2: cacheEntry({ tags: ["RPG"] }),
    };
    const stats = computeStats(wins, cacheByAppId, [2]);
    expect(stats.topGenres).toEqual([
      { tag: "RPG", count: 2 },
      { tag: "Indie", count: 1 },
    ]);
  });

  it("breaks genre ties alphabetically", () => {
    const wins: WinEvent[] = [{ steamAppId: 1, wonAt: null }];
    const cacheByAppId = { 1: cacheEntry({ tags: ["Zeta", "Alfa"] }) };
    const stats = computeStats(wins, cacheByAppId, []);
    expect(stats.topGenres).toEqual([
      { tag: "Alfa", count: 1 },
      { tag: "Zeta", count: 1 },
    ]);
  });

  it("sums HLTB hours once per unique winning game, not once per win", () => {
    const wins: WinEvent[] = [
      { steamAppId: 1, wonAt: null },
      { steamAppId: 1, wonAt: null },
      { steamAppId: 2, wonAt: null },
    ];
    const cacheByAppId = {
      1: cacheEntry({ hltbMainStory: 10 }),
      2: cacheEntry({ hltbMainStory: 5 }),
    };
    expect(computeStats(wins, cacheByAppId, []).totalHltbHours).toBe(15);
  });

  it("treats a missing hltbMainStory as zero hours", () => {
    const wins: WinEvent[] = [{ steamAppId: 1, wonAt: null }];
    const cacheByAppId = { 1: cacheEntry({}) };
    expect(computeStats(wins, cacheByAppId, []).totalHltbHours).toBe(0);
  });

  it("counts activity within 7 and 30 day windows, excluding wins without wonAt", () => {
    const now = Date.now();
    const wins: WinEvent[] = [
      { steamAppId: 1, wonAt: now - 1 * 24 * 60 * 60 * 1000 },
      { steamAppId: 2, wonAt: now - 20 * 24 * 60 * 60 * 1000 },
      { steamAppId: 3, wonAt: now - 60 * 24 * 60 * 60 * 1000 },
      { steamAppId: 4, wonAt: null },
    ];
    const stats = computeStats(wins, {}, []);
    expect(stats.totalWins).toBe(4);
    expect(stats.activity.last7days).toBe(1);
    expect(stats.activity.last30days).toBe(2);
  });

  it("picks the weekday with the most wins as mostActiveWeekday", () => {
    const monday = new Date(2026, 6, 20, 12, 0, 0).getTime();
    const tuesday = new Date(2026, 6, 21, 12, 0, 0).getTime();
    const wins: WinEvent[] = [
      { steamAppId: 1, wonAt: monday },
      { steamAppId: 2, wonAt: monday },
      { steamAppId: 3, wonAt: tuesday },
    ];
    expect(computeStats(wins, {}, []).activity.mostActiveWeekday).toBe("poniedziałek");
  });

  it("returns null mostActiveWeekday when no wins have a timestamp", () => {
    const wins: WinEvent[] = [{ steamAppId: 1, wonAt: null }];
    expect(computeStats(wins, {}, []).activity.mostActiveWeekday).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL with "Cannot find module './stats'" (file doesn't exist yet).

- [ ] **Step 3: Implement `computeStats`**

```ts
/** Statystyki wyprowadzone z ukończonych sesji Versus (nie z ręcznego statusu
 * "zagrane" w puli pokoju -- to osobna, niepowiązana akcja, zob. spec Fazy C
 * kawałek 2). Czysta funkcja, bez zależności od Firestore/DOM (wzorem
 * elimination.ts/history.ts) -- testowalna niezależnie. `wonAt: null` dla
 * wygranych sprzed dodania finishedAt (pokój) -- liczą się wszędzie poza
 * `activity`, która wymaga znacznika czasu. */

import type { SteamCacheEntry } from "@/lib/steam";

export type WinEvent = { steamAppId: number; wonAt: number | null };

export type Stats = {
  totalWins: number;
  topGames: { steamAppId: number; wins: number }[];
  topGenres: { tag: string; count: number }[];
  totalHltbHours: number;
  activity: {
    last7days: number;
    last30days: number;
    mostActiveWeekday: string | null;
  };
};

const TOP_GAMES_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
// Ręcznie wypisane nazwy zamiast Intl/toLocaleDateString -- ta sama decyzja co
// pluralizeGry w history.ts: dostępność pełnych danych ICU dla "pl-PL" na
// dowolnym Node runtime nie jest gwarantowana, tablica jest prostsza i pewna.
const WEEKDAY_NAMES = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

export function computeStats(
  wins: WinEvent[],
  cacheByAppId: Record<number, SteamCacheEntry | undefined>,
  likedAppIds: number[],
): Stats {
  const totalWins = wins.length;

  const winCounts = new Map<number, number>();
  for (const w of wins) {
    winCounts.set(w.steamAppId, (winCounts.get(w.steamAppId) ?? 0) + 1);
  }
  const topGames = [...winCounts.entries()]
    .map(([steamAppId, count]) => ({ steamAppId, wins: count }))
    .sort((a, b) => (b.wins !== a.wins ? b.wins - a.wins : a.steamAppId - b.steamAppId))
    .slice(0, TOP_GAMES_LIMIT);

  const genreAppIds = new Set<number>([...wins.map((w) => w.steamAppId), ...likedAppIds]);
  const genreCounts = new Map<string, number>();
  for (const appId of genreAppIds) {
    for (const tag of cacheByAppId[appId]?.tags ?? []) {
      genreCounts.set(tag, (genreCounts.get(tag) ?? 0) + 1);
    }
  }
  const topGenres = [...genreCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));

  const uniqueWinAppIds = new Set(wins.map((w) => w.steamAppId));
  let totalHltbHours = 0;
  for (const appId of uniqueWinAppIds) {
    totalHltbHours += cacheByAppId[appId]?.hltbMainStory ?? 0;
  }

  const timedWins = wins.filter((w): w is { steamAppId: number; wonAt: number } => w.wonAt !== null);
  const now = Date.now();
  const last7days = timedWins.filter((w) => now - w.wonAt <= 7 * DAY_MS).length;
  const last30days = timedWins.filter((w) => now - w.wonAt <= 30 * DAY_MS).length;

  let mostActiveWeekday: string | null = null;
  if (timedWins.length > 0) {
    const weekdayCounts = new Map<string, number>();
    for (const w of timedWins) {
      const name = WEEKDAY_NAMES[new Date(w.wonAt).getDay()];
      weekdayCounts.set(name, (weekdayCounts.get(name) ?? 0) + 1);
    }
    mostActiveWeekday = [...weekdayCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return {
    totalWins,
    topGames,
    topGenres,
    totalHltbHours,
    activity: { last7days, last30days, mostActiveWeekday },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS, all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat: add computeStats pure module with full test coverage"
```

---

### Task 6: Room — `StatsScreen.tsx`, route, and lobby link

**Files:**
- Create: `src/components/room/StatsScreen.tsx`
- Create: `src/app/room/[code]/stats/page.tsx`
- Modify: `src/components/room/RoomLobby.tsx:177-183` (add a link, mirroring the existing "Historia" link)

**Interfaces:**
- Consumes: `subscribeToEliminationRounds`, `subscribeToLiked`, `type RoundDoc` from `@/lib/rooms`; `computeStats`, `type Stats` from `@/lib/stats`; `type SteamCacheEntry` from `@/lib/steam`; `useParticipant` from `@/lib/useParticipant`; `db` from `@/lib/firebase`.
- Produces: route `/room/[code]/stats`, reachable from `RoomLobby`.

- [ ] **Step 1: Create `StatsScreen.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeToEliminationRounds, subscribeToLiked, type RoundDoc } from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import { computeStats, type Stats, type WinEvent } from "@/lib/stats";
import type { SteamCacheEntry } from "@/lib/steam";

export function StatsScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [rounds, setRounds] = useState<RoundDoc[]>([]);
  const [likedAppIds, setLikedAppIds] = useState<number[]>([]);
  const [cacheByAppId, setCacheByAppId] = useState<Record<number, SteamCacheEntry | undefined>>({});

  useEffect(() => subscribeToEliminationRounds(roomCode, setRounds), [roomCode]);
  useEffect(
    () => subscribeToLiked(roomCode, (games) => setLikedAppIds(games.map((g) => g.steamAppId))),
    [roomCode],
  );

  const wins: WinEvent[] = rounds
    .filter((r) => r.status === "finished" && r.survivors?.length === 1)
    .map((r) => ({ steamAppId: r.survivors![0], wonAt: r.finishedAt?.toMillis?.() ?? null }));

  useEffect(() => {
    const ids = [...new Set([...wins.map((w) => w.steamAppId), ...likedAppIds])];
    let cancelled = false;
    Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(db, "steam_cache", String(id)));
        return [id, snap.exists() ? (snap.data() as SteamCacheEntry) : undefined] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setCacheByAppId(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, likedAppIds]);

  if (!participantId) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">
        Wróć do <Link href={`/room/${roomCode}`} className="underline">lobby</Link>, żeby dołączyć do pokoju.
      </p>
    );
  }

  const stats: Stats = computeStats(wins, cacheByAppId, likedAppIds);

  return (
    <main className="flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[30px]">
      <div className="flex items-center gap-3">
        <Link
          href={`/room/${roomCode}`}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </Link>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Statystyki</h1>
      </div>

      {stats.totalWins === 0 ? (
        <p className="text-text-secondary py-8 text-center text-sm">
          Jeszcze nie rozegraliście żadnego Versus 🎮
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StatsBody stats={stats} cacheByAppId={cacheByAppId} />
        </div>
      )}
    </main>
  );
}

function StatsBody({
  stats,
  cacheByAppId,
}: {
  stats: Stats;
  cacheByAppId: Record<number, SteamCacheEntry | undefined>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <p className="text-sm font-bold text-foreground">
          Rozegraliście {stats.totalWins} {stats.totalWins === 1 ? "Versus" : "razy Versus"} 🏆
        </p>
        <ul className="flex flex-col gap-2">
          {stats.topGames.map((g) => {
            const cover = cacheByAppId[g.steamAppId]?.headerImageUrl;
            const name = cacheByAppId[g.steamAppId]?.name ?? "…";
            return (
              <li key={g.steamAppId} className="bg-card border-border flex items-center gap-3 rounded-xl border p-3">
                {cover && (
                  <Image src={cover} alt="" width={96} height={48} className="h-12 w-24 shrink-0 rounded-lg object-cover" />
                )}
                <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                <span className="text-text-secondary ml-auto shrink-0 text-xs font-semibold">{g.wins}×</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-bold text-foreground">Ulubione gatunki</p>
        {stats.topGenres.length === 0 ? (
          <p className="text-text-secondary text-xs">Brak danych.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {stats.topGenres.map((g) => (
              <li key={g.tag} className="bg-secondary rounded-full px-3 py-1.5 text-xs font-semibold text-foreground">
                {g.tag} ({g.count})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-bold text-foreground">Czas gry</p>
        <p className="text-text-secondary text-xs">
          Łącznie zagracie ok. {stats.totalHltbHours}h, jeśli dokończycie wszystko.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-bold text-foreground">Aktywność</p>
        <p className="text-text-secondary text-xs">
          {stats.activity.last7days} {stats.activity.last7days === 1 ? "gra" : "gier"} w ostatnim tygodniu,{" "}
          {stats.activity.last30days} w ostatnim miesiącu
          {stats.activity.mostActiveWeekday ? `, najbardziej aktywny dzień: ${stats.activity.mostActiveWeekday}` : ""}.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create the route page**

```tsx
import { StatsScreen } from "@/components/room/StatsScreen";

export default async function StatsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <StatsScreen roomCode={code} />;
}
```

- [ ] **Step 3: Add the "Statystyki" link to the lobby**

In `src/components/room/RoomLobby.tsx`, add a new `Link` right after the existing "Historia" link (`src/components/room/RoomLobby.tsx:177-182`):

```tsx
        <Link
          href={`/room/${roomCode}/history`}
          className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
        >
          Historia
        </Link>
        <Link
          href={`/room/${roomCode}/stats`}
          className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
        >
          Statystyki
        </Link>
```

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/room/StatsScreen.tsx src/app/room/[code]/stats/page.tsx src/components/room/RoomLobby.tsx
git commit -m "feat: add room Statystyki screen with link from lobby"
```

---

### Task 7: Solo — `SoloStatsScreen.tsx` and menu wiring

**Files:**
- Create: `src/components/solo/SoloStatsScreen.tsx`
- Modify: `src/components/solo/SoloSettingsScreen.tsx` (add an `onViewStats` prop + button)
- Modify: `src/components/solo/SoloHome.tsx` (add `"stats"` screen variant + render)

**Interfaces:**
- Consumes: `getLocalVersusHistory` from `@/lib/localVersusHistory`; `getLocalLiked` from `@/lib/localLiked`; `computeStats`, `type Stats`, `type WinEvent` from `@/lib/stats`; `type SteamCacheEntry` from `@/lib/steam`.
- Produces: a screen reachable from the solo home menu via a new "Statystyki" button.

- [ ] **Step 1: Create `SoloStatsScreen.tsx`**

Reuses the same `StatsBody` rendering logic as the room screen — duplicated here rather than shared, matching this codebase's existing convention of separate near-identical room/solo screen implementations (e.g. `HistoryScreen.tsx` has no solo equivalent, `SoloLikedScreen.tsx`/`LikedScreen.tsx` are already two independent files for the same concept).

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getLocalVersusHistory } from "@/lib/localVersusHistory";
import { getLocalLiked } from "@/lib/localLiked";
import { computeStats, type Stats, type WinEvent } from "@/lib/stats";
import type { SteamCacheEntry } from "@/lib/steam";

export function SoloStatsScreen({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [cacheByAppId, setCacheByAppId] = useState<Record<number, SteamCacheEntry | undefined>>({});

  useEffect(() => {
    let cancelled = false;
    const history = getLocalVersusHistory();
    const likedAppIds = getLocalLiked();
    const wins: WinEvent[] = history.map((h) => ({ steamAppId: h.steamAppId, wonAt: h.wonAt }));
    const ids = [...new Set([...wins.map((w) => w.steamAppId), ...likedAppIds])];

    Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(db, "steam_cache", String(id)));
        return [id, snap.exists() ? (snap.data() as SteamCacheEntry) : undefined] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const cache = Object.fromEntries(entries);
      setCacheByAppId(cache);
      setStats(computeStats(wins, cache, likedAppIds));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[30px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Statystyki</h1>
      </div>

      {!stats ? (
        <p className="text-text-secondary py-8 text-center text-sm">Wczytuję…</p>
      ) : stats.totalWins === 0 ? (
        <p className="text-text-secondary py-8 text-center text-sm">
          Jeszcze nie rozegrałeś żadnego Versus 🎮
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground">
                Rozegrałeś {stats.totalWins} {stats.totalWins === 1 ? "Versus" : "razy Versus"} 🏆
              </p>
              <ul className="flex flex-col gap-2">
                {stats.topGames.map((g) => {
                  const cover = cacheByAppId[g.steamAppId]?.headerImageUrl;
                  const name = cacheByAppId[g.steamAppId]?.name ?? "…";
                  return (
                    <li key={g.steamAppId} className="bg-card border-border flex items-center gap-3 rounded-xl border p-3">
                      {cover && (
                        <Image src={cover} alt="" width={96} height={48} className="h-12 w-24 shrink-0 rounded-lg object-cover" />
                      )}
                      <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                      <span className="text-text-secondary ml-auto shrink-0 text-xs font-semibold">{g.wins}×</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground">Ulubione gatunki</p>
              {stats.topGenres.length === 0 ? (
                <p className="text-text-secondary text-xs">Brak danych.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {stats.topGenres.map((g) => (
                    <li key={g.tag} className="bg-secondary rounded-full px-3 py-1.5 text-xs font-semibold text-foreground">
                      {g.tag} ({g.count})
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground">Czas gry</p>
              <p className="text-text-secondary text-xs">
                Łącznie zagracie ok. {stats.totalHltbHours}h, jeśli dokończycie wszystko.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground">Aktywność</p>
              <p className="text-text-secondary text-xs">
                {stats.activity.last7days} {stats.activity.last7days === 1 ? "gra" : "gier"} w ostatnim tygodniu,{" "}
                {stats.activity.last30days} w ostatnim miesiącu
                {stats.activity.mostActiveWeekday ? `, najbardziej aktywny dzień: ${stats.activity.mostActiveWeekday}` : ""}.
              </p>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add the "Statystyki" button to `SoloSettingsScreen.tsx`**

Add an `onViewStats` prop to the component signature:

```tsx
export function SoloSettingsScreen({
  onLoadLibrary,
  loading,
  error,
  onViewStats,
}: {
  onLoadLibrary: (source: "library" | "catalog", profile: string, backlog: BacklogFilter) => void;
  loading: boolean;
  error: string | null;
  onViewStats: () => void;
}) {
```

Add a button right after the "Zapisane paczki gier" link (`src/components/solo/SoloSettingsScreen.tsx:141-144`):

```tsx
        <div className="mt-6 flex flex-col items-center gap-2">
          <Link href="/packages" className="text-text-secondary text-center text-sm underline">
            Zapisane paczki gier
          </Link>
          <button
            type="button"
            onClick={onViewStats}
            className="text-text-secondary text-center text-sm underline"
          >
            Statystyki
          </button>
```

- [ ] **Step 3: Wire the new screen into `SoloHome.tsx`**

Add `"stats"` to the `Screen` union and render it:

```tsx
type Screen =
  | { name: "settings" }
  | { name: "stats" }
  | { name: "swipe"; source: "library"; pool: SteamOwnedGame[] }
  | { name: "swipe"; source: "catalog"; excludeAppIds: number[] }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };
```

Add the import at the top:

```tsx
import { SoloStatsScreen } from "@/components/solo/SoloStatsScreen";
```

Add a render branch (right after the `"liked"` branch, before the final `SoloSettingsScreen` fallback):

```tsx
  if (screen.name === "stats") {
    return <SoloStatsScreen onBack={() => setScreen({ name: "settings" })} />;
  }

  return (
    <SoloSettingsScreen
      onLoadLibrary={handleLoadLibrary}
      loading={loading}
      error={error}
      onViewStats={() => setScreen({ name: "stats" })}
    />
  );
```

(This replaces the final `return <SoloSettingsScreen onLoadLibrary={handleLoadLibrary} loading={loading} error={error} />;` line.)

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/solo/SoloStatsScreen.tsx src/components/solo/SoloSettingsScreen.tsx src/components/solo/SoloHome.tsx
git commit -m "feat: add solo Statystyki screen with link from home menu"
```

---

### Task 8: Deploy `firestore.rules` (explicit approval required) and push

**Files:** none (deploy + push only)

**Interfaces:** none.

- [ ] **Step 1: Ask the user for explicit approval before deploying**

Show the diff from Task 2 (`git show <task-2-commit> -- firestore.rules`) and ask: "Deploy tę zmianę firestore.rules na produkcję (`tumolec-d67d9`) teraz?" Do not proceed to Step 2 without an explicit yes.

- [ ] **Step 2: Deploy**

Run: `npx firebase-tools deploy --only firestore:rules`
Expected: `+  firestore: released rules firestore.rules to cloud.firestore` with no errors.

- [ ] **Step 3: Push all commits from this plan to `origin`**

Run: `git push`
Expected: push succeeds, no conflicts.

---

### Task 9: Live verification (Playwright) — both modes, empty and populated states

**Files:** none (manual/Playwright verification only, no code changes)

**Interfaces:** none.

- [ ] **Step 1: Room — empty state**

Using Playwright, create a fresh room, join it, navigate to `/room/{code}/stats`. Confirm it shows "Jeszcze nie rozegraliście żadnego Versus 🎮" and no errors in the browser console.

- [ ] **Step 2: Room — populated state**

In the same room, like at least 2 games, run a full Versus round to a winner (reroll once to produce a second win for the same or a different game). Navigate to `/room/{code}/stats`. Confirm:
- Total wins count matches the number of completed Versus rounds.
- Top games list shows the winner(s) with correct win counts and cover art.
- Genres list is non-empty and matches the winning/liked games' tags.
- Activity line shows a non-zero "last 7 days" count and today's Polish weekday name.

This is the live check for the `finishedAt` field and the `firestore.rules` update from Tasks 1/2/8 — confirm in the Firestore console (or via a quick `getRound` read) that the finished round document actually has a `finishedAt` timestamp, not just that the UI doesn't crash.

- [ ] **Step 3: Solo — empty state**

Open the app fresh (or clear `localStorage` for the origin first), go to Statystyki from the home menu. Confirm it shows "Jeszcze nie rozegrałeś żadnego Versus 🎮".

- [ ] **Step 4: Solo — populated state**

Like at least 2 games in solo mode, run a local Versus to a winner. Return to home, open Statystyki. Confirm:
- Total wins is 1.
- The winning game appears in top games.
- Refresh the page and reopen Statystyki — confirm the win is still there (proves the localStorage log in Task 3/4 actually persists across reloads, unlike the pre-existing in-memory-only behavior).

- [ ] **Step 5: Report results to the user**

Summarize pass/fail for each of the 4 checks above. If anything fails, fix it as a follow-up task before considering the plan complete — do not report success without having actually run these checks.
