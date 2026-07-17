# Odkrywaj Dedup/Losowość + Ujednolicony Upgrade do Pokoju — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix repeated/always-popular games in Odkrywaj (dedup + real randomization), and let a solo player upgrade *either* the library *or* the catalog browsing session to a shared co-op room without losing already-liked games or the current genre filter.

**Architecture:** Backend randomization lives entirely in `src/lib/steam.ts`'s `fetchDiscoverPage` (one extra cheap probe request + page shuffle), reused unchanged by both `SoloSwipeScreen` and `RoomExploreScreen` since both already call the same `/api/steam/discover` route. Dedup is a one-line fix in both screens' `advance()`. The upgrade-to-coop flow is a new floating button (`RoomUpgradeButton`) that creates the room, transfers only liked games + genre filter (not full browsing history), and — per this plan's resolution of an ambiguity in the spec — **stays on the current screen showing the QR/join-info instead of navigating away immediately**; the host explicitly taps through to the shared Eksploruj screen afterward. That destination screen (`RoomExploreScreen`) gains `?source=&autostart=1` support so it skips its own start screen for the host.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Firebase Firestore (`firebase` client SDK), Vitest.

## Global Constraints

- No Firestore Security Rules changes needed — `firestore.rules` already allows open-shape writes to `liked`, `session/state`, and `participants` (verified: no per-user auth in this app, access controlled by room-code knowledge only).
- Match existing code style: Polish comments only where the WHY isn't obvious (existing convention throughout this repo), no comments restating what code does.
- No new npm dependencies.
- Firestore/UI-integration behavior (room creation, liked transfer, autostart) is verified manually via Playwright against the dev server, not unit tests — matches this repo's established convention (see spec's Testing section and every prior Tumolec feature).
- Every task that touches `.ts`/`.tsx` files ends with `npx tsc --noEmit` passing cleanly (no pre-existing type errors introduced).

---

### Task 1: Randomize + shuffle in `fetchDiscoverPage`

**Files:**
- Modify: `src/lib/steam.ts` (add `computeRandomDiscoverStart`, `shuffleDiscoverResults`; update `DiscoverPage` type and `fetchDiscoverPage`)
- Test: `src/lib/steam.test.ts`

**Interfaces:**
- Produces: `computeRandomDiscoverStart(totalCount: number, pageSize?: number): number` (exported, pure)
- Produces: `shuffleDiscoverResults(results: DiscoverResult[]): DiscoverResult[]` (exported, pure, does not mutate input)
- Produces: `DiscoverPage = { results: DiscoverResult[]; hasMore: boolean; start: number }` (new `start` field)
- Produces: `fetchDiscoverPage(tagIds: number[], start: number, options?: { randomize?: boolean }): Promise<DiscoverPage>` (existing signature gains optional third param)

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/lib/steam.test.ts` (after the existing `matchesTagOrCommunityFilter` describe block):

```ts
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
```

Update the import line at the top of the file:

```ts
import {
  parseSteamAppDetails,
  parseDiscoverAppIds,
  parseDiscoverResults,
  matchesTagOrCommunityFilter,
  computeRandomDiscoverStart,
  shuffleDiscoverResults,
} from "./steam";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: FAIL — `computeRandomDiscoverStart` and `shuffleDiscoverResults` are not exported from `./steam`.

- [ ] **Step 3: Implement `computeRandomDiscoverStart` and `shuffleDiscoverResults`**

In `src/lib/steam.ts`, add near the `DiscoverResult`/`DiscoverPage` types (after `parseDiscoverResults`, before `fetchDiscoverPage`):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: PASS (all tests in the file, including the two new describe blocks).

- [ ] **Step 5: Update `DiscoverPage` type and `fetchDiscoverPage` to use randomization**

Replace the existing `fetchDiscoverPage` (currently the last function in `src/lib/steam.ts`):

```ts
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
```

- [ ] **Step 6: Update the discover route to forward `random`**

Replace `src/app/api/steam/discover/route.ts` in full:

```ts
import { NextRequest, NextResponse } from "next/server";
import { fetchDiscoverPage, resolveSteamTagId } from "@/lib/steam";

export async function GET(request: NextRequest) {
  const genresParam = request.nextUrl.searchParams.get("genres") ?? "";
  const startParam = request.nextUrl.searchParams.get("start") ?? "0";
  const randomize = request.nextUrl.searchParams.get("random") === "1";
  const start = Number(startParam);
  if (!Number.isInteger(start) || start < 0) {
    return NextResponse.json({ error: "Podaj poprawny start." }, { status: 400 });
  }

  const tagIds = genresParam
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => resolveSteamTagId(g))
    .filter((id): id is number => id !== undefined);

  try {
    const page = await fetchDiscoverPage(tagIds, start, { randomize });
    return NextResponse.json(page);
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać katalogu ze Steam." }, { status: 502 });
  }
}
```

- [ ] **Step 7: Run full test suite and typecheck**

Run: `npx vitest run src/lib/steam.test.ts && npx tsc --noEmit`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/steam.ts src/lib/steam.test.ts src/app/api/steam/discover/route.ts
git commit -m "feat: randomize discover start + shuffle page for Odkrywaj"
```

---

### Task 2: Dedup fix — exclude already-shown cards in both Explore screens

**Files:**
- Modify: `src/components/solo/SoloSwipeScreen.tsx`
- Modify: `src/components/room/RoomExploreScreen.tsx`

**Interfaces:**
- Consumes: nothing new — uses the existing `excludeSetRef` and `candidate` variables already in scope inside each `advance()`.

- [ ] **Step 1: Add the appId to `excludeSetRef` in `SoloSwipeScreen.advance()`**

In `src/components/solo/SoloSwipeScreen.tsx`, inside `advance()`, immediately before the existing `setCurrentCard({` call (the block that builds and sets the card from `data`), add one line:

```ts
        // Dopisz appid do excludeSetRef w momencie pokazania karty (nie tylko
        // przy polubieniu) -- bez tego ten sam appid może wrócić na kolejnej
        // stronie, jeśli ranking Steama przesunie się między requestami.
        excludeSetRef.current.add(candidate.appId);
        setCurrentCard({
          steamAppId: data.steamAppId,
```

(Only the two lines shown are new/changed — the rest of the `setCurrentCard({...})` object body is unchanged.)

- [ ] **Step 2: Add the same line in `RoomExploreScreen.advance()`**

In `src/components/room/RoomExploreScreen.tsx`, inside `advance()`, immediately before `setCurrentCard(toSwipeGame({ ...data, steamAppId: candidate.appId }));`, add:

```ts
        excludeSetRef.current.add(candidate.appId);
        setCurrentCard(toSwipeGame({ ...data, steamAppId: candidate.appId }));
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors — `excludeSetRef.current` is already `Set<number>`, `candidate.appId` is already `number` in both files).

- [ ] **Step 4: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx src/components/room/RoomExploreScreen.tsx
git commit -m "fix: exclude already-shown cards from Odkrywaj to prevent repeats"
```

---

### Task 3: Wire `random=1` into `SoloSwipeScreen`'s first discover fetch

**Files:**
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

**Interfaces:**
- Consumes: `fetchDiscoverPage`'s new response shape `{ results, hasMore, start }` via the `/api/steam/discover` route (Task 1).

- [ ] **Step 1: Update `fetchNextDiscoverPage` to request randomization on the first fetch and read back `start`**

Replace the existing `fetchNextDiscoverPage` function:

```ts
  async function fetchNextDiscoverPage() {
    const genresParam = genreFilter.join(",");
    // discoverStartRef.current === 0 signals a fresh browsing session (mount,
    // or the genre-filter-reset effect below) -- randomize only that first
    // fetch, subsequent pages continue sequentially from the real start Steam
    // returned.
    const randomParam = discoverStartRef.current === 0 ? "&random=1" : "";
    const res = await fetch(
      `/api/steam/discover?genres=${encodeURIComponent(genresParam)}&start=${discoverStartRef.current}${randomParam}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as { results: { appId: number; tagIds: number[] }[]; hasMore: boolean; start: number };
  }
```

- [ ] **Step 2: Seed `discoverStartRef` from the response's actual `start`**

In `advance()`, find this line (inside the `if (cursorRef.current >= poolRef.current.length)` block):

```ts
        discoverStartRef.current += page.results.length;
```

Replace it with:

```ts
        discoverStartRef.current = page.start + page.results.length;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: randomize first Odkrywaj page in solo catalog browsing"
```

---

### Task 4: Wire `random=1` into `RoomExploreScreen`'s first discover fetch

**Files:**
- Modify: `src/components/room/RoomExploreScreen.tsx`

**Interfaces:**
- Consumes: same `{ results, hasMore, start }` shape as Task 3.

- [ ] **Step 1: Update `fetchNextDiscoverPage`**

Replace the existing function (identical pattern to Task 3, Step 1):

```ts
  async function fetchNextDiscoverPage() {
    const genresParam = genres.join(",");
    const randomParam = discoverStartRef.current === 0 ? "&random=1" : "";
    const res = await fetch(
      `/api/steam/discover?genres=${encodeURIComponent(genresParam)}&start=${discoverStartRef.current}${randomParam}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as { results: { appId: number; tagIds: number[] }[]; hasMore: boolean; start: number };
  }
```

- [ ] **Step 2: Seed `discoverStartRef` from the response's `start`**

Find in `advance()`:

```ts
        discoverStartRef.current += page.results.length;
```

Replace with:

```ts
        discoverStartRef.current = page.start + page.results.length;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/room/RoomExploreScreen.tsx
git commit -m "feat: randomize first Odkrywaj page in room catalog browsing"
```

---

### Task 5: Extract `useRoomShare` hook from `RoomLobby`

**Files:**
- Create: `src/lib/useRoomShare.ts`
- Modify: `src/components/room/RoomLobby.tsx`

**Interfaces:**
- Produces: `useRoomShare(roomCode: string, title?: string): { qrDataUrl: string | null; copied: boolean; handleShare: () => Promise<void> }` — consumed by `RoomLobby` (this task) and `RoomUpgradeButton` (Task 7).

- [ ] **Step 1: Create the hook**

Create `src/lib/useRoomShare.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Kod QR + udostępnianie linku do pokoju -- wyciągnięte z RoomLobby, żeby
 * RoomUpgradeButton mógł pokazać dokładnie to samo bez duplikowania logiki
 * QRCode/navigator.share. Kod QR celowo koduje publiczny URL produkcyjny
 * (nie window.location.origin) -- skanuje go inny telefon, który nie
 * dosięgnie localhosta ani preview-URL. */
export function useRoomShare(roomCode: string, title?: string) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!roomCode) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(`https://tumolec.vercel.app/room/${roomCode}`, { margin: 1, width: 200 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [roomCode]);

  async function handleShare() {
    const url = `https://tumolec.vercel.app/room/${roomCode}`;
    if (navigator.share) {
      // Odrzucenie (użytkownik anuluje arkusz share) jest nieszkodliwe -- ignorujemy.
      try {
        await navigator.share({ title: title ?? "Tumolec", url });
      } catch {
        /* anulowane przez użytkownika */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard niedostępny/odrzucony -- nic więcej nie da się zrobić */
    }
  }

  return { qrDataUrl, copied, handleShare };
}
```

- [ ] **Step 2: Use the hook in `RoomLobby`**

In `src/components/room/RoomLobby.tsx`:

Remove the import `import QRCode from "qrcode";` (line 5) and add:

```ts
import { useRoomShare } from "@/lib/useRoomShare";
```

Replace these lines (currently lines 22-51: the `qrDataUrl`/`copied` state, the `QRCode.toDataURL` effect, and `handleShare`):

```ts
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Kod QR celowo koduje publiczny URL produkcyjny (nie window.location.origin) --
    // skanuje go inny telefon, który nie dosięgnie localhosta ani preview-URL.
    QRCode.toDataURL(`https://tumolec.vercel.app/room/${roomCode}`, { margin: 1, width: 200 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [roomCode]);

  async function handleShare() {
    const url = `https://tumolec.vercel.app/room/${roomCode}`;
    if (navigator.share) {
      // Odrzucenie (użytkownik anuluje arkusz share) jest nieszkodliwe -- ignorujemy.
      try {
        await navigator.share({ title: roomName ?? "Tumolec", url });
      } catch {
        /* anulowane przez użytkownika */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard niedostępny/odrzucony -- nic więcej nie da się zrobić */
    }
  }
```

with:

```ts
  const { qrDataUrl, copied, handleShare } = useRoomShare(roomCode, roomName ?? undefined);
```

Everything downstream (`qrDataUrl` used in the `<img>` block, `copied`/`handleShare` used in the "Udostępnij pokój" button) stays exactly as-is — same variable names, no other changes in this file.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/useRoomShare.ts src/components/room/RoomLobby.tsx
git commit -m "refactor: extract useRoomShare hook from RoomLobby"
```

---

### Task 6: `RoomExploreScreen` autostart support

**Files:**
- Modify: `src/components/room/RoomExploreScreen.tsx`
- Modify: `src/app/room/[code]/explore/page.tsx`

**Interfaces:**
- Consumes (from Task 7, but designed now so Task 7 can rely on it): URL shape `/room/{code}/explore?source=shared|catalog&autostart=1`.
- Produces: `handleStart(startSource?: "shared" | "catalog")` — now accepts an optional override instead of only reading the `source` state closure. Callers outside this file don't call `handleStart` directly (it's internal), but the signature change matters for anyone reading this file later.

- [ ] **Step 1: Wrap the page in Suspense (required by Next.js for `useSearchParams`)**

Replace `src/app/room/[code]/explore/page.tsx` in full:

```tsx
import { Suspense } from "react";
import { RoomExploreScreen } from "@/components/room/RoomExploreScreen";

export default async function ExplorePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <RoomExploreScreen roomCode={code} />
    </Suspense>
  );
}
```

- [ ] **Step 2: Import `useSearchParams` and add an autostart guard ref**

In `src/components/room/RoomExploreScreen.tsx`, update the import from `next/navigation`... there isn't one yet — add a new import line after the `next/link` import:

```ts
import { useSearchParams } from "next/navigation";
```

Inside the component, after the existing `const excludeSetRef = useRef<Set<number>>(new Set());` line, add:

```ts
  const searchParams = useSearchParams();
  const autostartedRef = useRef(false);
```

- [ ] **Step 3: Change `handleStart` to accept an optional source override**

Replace the existing `handleStart` function:

```ts
  function handleStart(startSource: "shared" | "catalog" = source) {
    cursorRef.current = 0;
    discoverStartRef.current = 0;
    discoverExhaustedRef.current = startSource !== "catalog";
    if (startSource === "shared") {
      poolRef.current = shared.map((appId) => ({ appId, tagIds: null }));
    } else {
      poolRef.current = [];
      const me = participants.find((p) => p.participantId === participantId);
      excludeSetRef.current = new Set(me?.steamLibraryAppIds ?? []);
    }
    setSource(startSource);
    setExhausted(false);
    setStarted(true);
    advance();
  }
```

- [ ] **Step 4: Fix the existing "Zacznij przeglądać" button call site**

Find:

```tsx
            <button
              type="button"
              onClick={handleStart}
              className="bg-accent-brand mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
            >
              Zacznij przeglądać
            </button>
```

Change `onClick={handleStart}` to `onClick={() => handleStart()}` (otherwise React would pass the click `MouseEvent` as `startSource`).

- [ ] **Step 5: Add the autostart effect**

After the existing `useEffect` that resets pagination on genre change (the one ending `}, [genres]);`), add:

```ts
  // Host przychodzący z RoomUpgradeButton (SoloSwipeScreen) -- pomija ekran
  // wyboru źródła i startuje od razu z przekazanym source. Dla "shared"
  // czekamy aż subscribeToParticipants dostarczy przynajmniej naszego
  // własnego uczestnika, inaczej `shared` policzyłoby się z pustej listy.
  useEffect(() => {
    if (autostartedRef.current || started || !participantId) return;
    const autostart = searchParams.get("autostart") === "1";
    const initialSource = searchParams.get("source");
    if (!autostart || (initialSource !== "shared" && initialSource !== "catalog")) return;
    if (initialSource === "shared" && participants.length === 0) return;
    autostartedRef.current = true;
    handleStart(initialSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, started, participants]);
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Build to catch any Suspense/prerendering issues**

Run: `npm run build`
Expected: build succeeds with no "Missing Suspense boundary" error for the explore route.

- [ ] **Step 8: Commit**

```bash
git add src/components/room/RoomExploreScreen.tsx src/app/room/[code]/explore/page.tsx
git commit -m "feat: support autostart via URL for RoomExploreScreen"
```

---

### Task 7: `RoomUpgradeButton` component

**Files:**
- Create: `src/components/solo/RoomUpgradeButton.tsx`

**Interfaces:**
- Consumes: `useRoomShare` (Task 5), `createRoom`/`joinRoom`/`likeGame`/`setExploreGenreFilter` from `src/lib/rooms.ts` (all pre-existing), `getLocalLiked` from `src/lib/localLiked.ts` (pre-existing).
- Produces: `RoomUpgradeButton(props: { source: "library"; libraryAppIds: number[]; genreFilter: string[] } | { source: "catalog"; genreFilter: string[] })` — consumed by `SoloSwipeScreen` in Task 8.

- [ ] **Step 1: Create the component**

Create `src/components/solo/RoomUpgradeButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom, likeGame, setExploreGenreFilter } from "@/lib/rooms";
import { getLocalLiked } from "@/lib/localLiked";
import { useRoomShare } from "@/lib/useRoomShare";

type Props =
  | { source: "library"; libraryAppIds: number[]; genreFilter: string[] }
  | { source: "catalog"; genreFilter: string[] };

/** Podnosi bieżącą sesję solo (biblioteka LUB katalog) do współdzielonego
 * pokoju: tworzy pokój, dołącza hosta, przenosi polubione gry
 * (rooms/{code}/liked) i bieżący filtr gatunku. Świadomie NIE przenosi
 * historii "pokazanych, ale niepolubionych" gier z sesji solo -- nowy
 * uczestnik i tak zaczyna od zera, zob. spec. Po utworzeniu zostaje na
 * miejscu i pokazuje QR/kod/link zamiast nawigować od razu -- host sam
 * decyduje kiedy przejść do wspólnego Eksploruj. */
export function RoomUpgradeButton(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { qrDataUrl, copied, handleShare } = useRoomShare(roomCode ?? "", "Wieczór gier");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const code = await createRoom("Wieczór gier");
      const id = crypto.randomUUID();
      const libraryAppIds = props.source === "library" ? props.libraryAppIds : undefined;
      await joinRoom(code, id, trimmed, libraryAppIds);
      localStorage.setItem(`tumolec:${code}:participantId`, id);
      localStorage.setItem(`tumolec:${code}:nickname`, trimmed);
      for (const appId of getLocalLiked()) {
        await likeGame(code, appId, id);
      }
      if (props.genreFilter.length > 0) {
        await setExploreGenreFilter(code, props.genreFilter);
      }
      setRoomCode(code);
    } catch {
      setError("Nie udało się utworzyć pokoju. Spróbuj ponownie.");
    } finally {
      setCreating(false);
    }
  }

  function handleContinue() {
    if (!roomCode) return;
    const roomSource = props.source === "library" ? "shared" : "catalog";
    router.push(`/room/${roomCode}/explore?source=${roomSource}&autostart=1`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Co-op / Dodaj znajomego"
        className="bg-secondary fixed bottom-6 left-4 z-20 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
      >
        🤝
      </button>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={() => setOpen(false)}>
          <div className="bg-background w-full rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold text-foreground">Co-op / Dodaj znajomego</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zamknij"
                className="text-text-secondary text-2xl"
              >
                ✕
              </button>
            </div>

            {!roomCode ? (
              <form onSubmit={handleCreate} className="flex flex-col gap-3">
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Twój pseudonim"
                  maxLength={24}
                  className="border-border rounded-lg border bg-transparent px-3 py-2 text-sm text-foreground"
                />
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-accent-brand rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {creating ? "Tworzę…" : "Stwórz pokój"}
                </button>
                {error && <p className="text-pass text-sm">{error}</p>}
              </form>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt={`Kod QR pokoju ${roomCode}`}
                    className="h-[160px] w-[160px] rounded-xl bg-white p-2"
                  />
                )}
                <p className="text-text-secondary text-center text-xs tracking-widest">KOD POKOJU: {roomCode}</p>
                <button
                  type="button"
                  onClick={handleShare}
                  className="bg-secondary w-full rounded-full py-3 text-center text-sm font-bold text-foreground"
                >
                  {copied ? "Skopiowano link!" : "Udostępnij pokój"}
                </button>
                <button
                  type="button"
                  onClick={handleContinue}
                  className="bg-accent-brand w-full rounded-full py-3 text-center text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
                >
                  Przejdź do wspólnego Eksploruj →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/solo/RoomUpgradeButton.tsx
git commit -m "feat: add unified RoomUpgradeButton for library and catalog sources"
```

---

### Task 8: Wire `RoomUpgradeButton` into `SoloSwipeScreen`, remove old library-only upgrade UI

**Files:**
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

**Interfaces:**
- Consumes: `RoomUpgradeButton` (Task 7).

- [ ] **Step 1: Remove unused imports and state**

Remove this import line (no longer used anywhere in this file after this task):

```ts
import { useRouter } from "next/navigation";
```

Remove `createRoom, joinRoom, hydrateAndAddGamesToPool` from the `rooms` import — change:

```ts
import { createRoom, joinRoom, hydrateAndAddGamesToPool } from "@/lib/rooms";
```

to nothing (delete the line entirely — nothing else in this file imports from `@/lib/rooms` after this task).

Add a new import:

```ts
import { RoomUpgradeButton } from "@/components/solo/RoomUpgradeButton";
```

Remove the line `const router = useRouter();`.

Remove these four state declarations:

```ts
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeNickname, setUpgradeNickname] = useState("");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
```

- [ ] **Step 2: Remove `handleUpgradeToCoop`**

Delete the entire function:

```ts
  async function handleUpgradeToCoop(e: React.FormEvent) {
    e.preventDefault();
    const nickname = upgradeNickname.trim();
    if (!nickname) return;
    setUpgrading(true);
    setUpgradeError(null);
    try {
      if (props.source !== "library") return;
      const appIds = props.pool.map((g) => g.steamAppId);
      const code = await createRoom("Wieczór gier");
      const id = crypto.randomUUID();
      await joinRoom(code, id, nickname, appIds);
      localStorage.setItem(`tumolec:${code}:participantId`, id);
      localStorage.setItem(`tumolec:${code}:nickname`, nickname);
      await hydrateAndAddGamesToPool(code, appIds, id);
      router.push(`/room/${code}`);
    } catch {
      setUpgradeError("Nie udało się utworzyć pokoju. Spróbuj ponownie.");
      setUpgrading(false);
    }
  }
```

- [ ] **Step 3: Simplify the header — remove the library-only button**

Replace the header block:

```tsx
      <div className="flex items-center gap-3 pr-12">
        <button
          type="button"
          onClick={onExit}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <h1 className="font-heading text-[18px] font-bold text-foreground">
          {props.source === "library" ? "Twoja biblioteka" : "Cały katalog Steam"}
        </h1>
        <button
          type="button"
          onClick={onViewLiked}
          className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground"
        >
          ❤️ {getLocalLiked().length}
        </button>
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
        <form onSubmit={handleUpgradeToCoop} className="bg-card border-border flex gap-2 rounded-xl border p-3">
          <input
            value={upgradeNickname}
            onChange={(e) => setUpgradeNickname(e.target.value)}
            placeholder="Twój pseudonim"
            maxLength={24}
            className="border-border flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={upgrading}
            className="bg-accent-brand rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {upgrading ? "Tworzę…" : "Stwórz"}
          </button>
        </form>
      )}
      {upgradeError && <p className="text-pass text-sm">{upgradeError}</p>}
```

with:

```tsx
      <div className="flex items-center gap-3 pr-12">
        <button
          type="button"
          onClick={onExit}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <h1 className="font-heading text-[18px] font-bold text-foreground">
          {props.source === "library" ? "Twoja biblioteka" : "Cały katalog Steam"}
        </h1>
        <button
          type="button"
          onClick={onViewLiked}
          className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground"
        >
          ❤️ {getLocalLiked().length}
        </button>
      </div>
```

- [ ] **Step 4: Render `RoomUpgradeButton` next to `MiniGameLauncher`**

Replace:

```tsx
      {!exhausted && !loadingCard && <SwipeActionButtons onPass={handlePass} onLike={handleLike} />}
      <MiniGameLauncher mode={{ kind: "solo" }} />
    </main>
  );
}
```

with:

```tsx
      {!exhausted && !loadingCard && <SwipeActionButtons onPass={handlePass} onLike={handleLike} />}
      <MiniGameLauncher mode={{ kind: "solo" }} />
      {props.source === "library" ? (
        <RoomUpgradeButton source="library" libraryAppIds={props.pool.map((g) => g.steamAppId)} genreFilter={genreFilter} />
      ) : (
        <RoomUpgradeButton source="catalog" genreFilter={genreFilter} />
      )}
    </main>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: replace library-only upgrade UI with unified RoomUpgradeButton"
```

---

### Task 9: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing suite + new tests from Task 1).

- [ ] **Step 2: Run a full build**

Run: `npm run build`
Expected: succeeds with no type errors, no missing-Suspense errors.

- [ ] **Step 3: Manual Playwright verification — catalog source dedup + randomness**

Start the dev server (`npm run dev`), then using the Playwright browser tools:
1. Navigate to `http://localhost:3000`.
2. On the solo settings screen, choose "Eksploruj katalog" without a profile.
3. Swipe/pass through ~15 cards, noting the sequence of game titles shown.
4. Confirm the first card is **not** Counter-Strike 2 (or whatever previously always appeared first) — if it happens to be by chance, reload and retry once; it should vary across reloads.
5. Confirm no title repeats within the ~15 shown.

- [ ] **Step 4: Manual Playwright verification — catalog upgrade to co-op**

1. From the same catalog browsing session, like 2-3 games.
2. Tap the new bottom-left "🤝" button, enter a nickname, submit.
3. Confirm a QR code + room code appear (no navigation yet).
4. Tap "Przejdź do wspólnego Eksploruj →".
5. Confirm landing directly in the room's Eksploruj swipe view (not the "Zacznij przeglądać" screen), source = catalog.
6. Navigate to `/room/{code}/liked` and confirm the 2-3 previously-liked games are present.

- [ ] **Step 5: Manual Playwright verification — library upgrade still works**

1. From solo settings, load a library via a real Steam profile.
2. Like 1-2 games, tap "🤝", create a room.
3. Confirm landing in the room's shared-library Eksploruj view after tapping through, and that `steamLibraryAppIds` was set (check `/room/{code}` lobby shows the participant, and Eksploruj's "Wspólna biblioteka: N gier" line is non-zero once a second participant with overlapping library joins — or at minimum that the flow completes without errors for a single participant).

- [ ] **Step 6: Fix any issues found, re-run Steps 1-2**

If manual verification surfaces a bug, fix it in the relevant task's file, re-run `npm test && npm run build`, and commit the fix separately (`fix: ...`).

---

## Self-Review Notes

- **Spec coverage:** dedup (Task 2), randomization Approach 1 (Task 1, 3, 4), unified upgrade button (Task 7, 8), liked-games transfer (Task 7 Step 1), genre filter carryover (Task 7 Step 1), autostart landing in Eksploruj (Task 6), QR/share reuse (Task 5) — all covered.
- **Deviation from spec, called out explicitly:** the spec's Part B step 2 listed `router.push` as the last action of the create-room handler, which would contradict step 4's "the button turns into a join-info widget" (you can't see a widget on a screen you just navigated away from). This plan resolves it by keeping the host on the current screen after creation (showing QR/code/share) and adding an explicit "Przejdź do wspólnego Eksploruj →" action for the actual navigation. Functionally equivalent to the spec's intent, just sequenced correctly.
- **Type consistency:** `DiscoverPage`/`fetchDiscoverPage` response shape (`{ results, hasMore, start }`) is identical across Task 1 (producer), Task 3 and Task 4 (consumers). `RoomUpgradeButton` props type matches exactly how it's called in Task 8. `handleStart`'s new optional parameter is used consistently in Task 6 (definition + button call site + autostart effect).
- **No placeholders:** every step has complete, exact code.
