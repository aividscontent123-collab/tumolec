# UX Backlog Group 2 (E + B2 + A1/A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "medium" priority tier of the 2026-07-18 UX feedback backlog: fix swipe-card gesture sensitivity during vertical scroll (E), fix the tag filter bar so selected/ad-hoc tags stay visible and jump to the front (B2), and simplify the solo start screen by removing a redundant filter and hiding the profile field until needed (A1+A2).

**Architecture:** Each item is scoped to 1-3 existing files with no new dependencies, no Firestore/data-model changes. Task 3 (A1+A2) touches three files together (`SoloSettingsScreen.tsx`, `SoloHome.tsx`, `SoloSwipeScreen.tsx`) because removing a prop requires updating every link in that chain in the same commit or the build breaks.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, Vitest, framer-motion, @use-gesture/react.

## Global Constraints

- No new npm dependencies.
- Source spec: `docs/superpowers/specs/2026-07-18-ux-feedback-backlog-design.md` sections E, B2, A1, A2.
- `src/lib/steamLibrary.ts`'s `MultiplayerFilter` type and `matchesMultiplayerFilter` function must NOT be deleted — `RoomExploreScreen.tsx` and `SharedLibrarySection.tsx` still use them; only the solo-screen chain (`SoloSettingsScreen` → `SoloHome` → `SoloSwipeScreen`) stops threading it.
- `src/lib/swipeGesture.ts` (swipe-commit thresholds) is explicitly out of scope for Task 1 — do not touch it, only the in-drag visual tracking in `SwipeCard.tsx` changes.
- Full source doc (project roadmap/context): `work/active/Tumolec.md` in the Obsidian vault at `C:\Users\miros\Desktop\RUFLO`.

---

### Task 1: Directional lock on swipe-card drag gesture (item E)

**Files:**
- Modify: `src/components/swipe/SwipeCard.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no prop/export changes — purely internal gesture-handling behavior.

- [ ] **Step 1: Add a direction-lock ratio constant**

In `src/components/swipe/SwipeCard.tsx:12`, change:

```typescript
const SPRING_BACK = { type: "spring", stiffness: 500, damping: 30 } as const;
```

to:

```typescript
const SPRING_BACK = { type: "spring", stiffness: 500, damping: 30 } as const;
const DIRECTION_LOCK_RATIO = 1.5;
```

- [ ] **Step 2: Only track horizontal movement when it clearly dominates vertical movement**

Change the drag handler (currently at lines 55-70):

```typescript
  const bind = useDrag(({ movement: [mx, my], velocity: [vx], last }) => {
    if (!last) {
      x.set(mx);
      y.set(my);
      return;
    }
    const direction = decideSwipeDirection(mx, vx);
    if (direction && onSwipe) {
      animate(x, direction === "right" ? 700 : -700, { duration: 0.3, ease: "easeOut" });
      animate(y, my, { duration: 0.3, ease: "easeOut" });
      onSwipe(direction);
    } else {
      animate(x, 0, SPRING_BACK);
      animate(y, 0, SPRING_BACK);
    }
  });
```

to:

```typescript
  const bind = useDrag(({ movement: [mx, my], velocity: [vx], last }) => {
    if (!last) {
      if (Math.abs(mx) > Math.abs(my) * DIRECTION_LOCK_RATIO) {
        x.set(mx);
        y.set(my);
      }
      return;
    }
    const direction = decideSwipeDirection(mx, vx);
    if (direction && onSwipe) {
      animate(x, direction === "right" ? 700 : -700, { duration: 0.3, ease: "easeOut" });
      animate(y, my, { duration: 0.3, ease: "easeOut" });
      onSwipe(direction);
    } else {
      animate(x, 0, SPRING_BACK);
      animate(y, 0, SPRING_BACK);
    }
  });
```

Note: the `last` (release) branch is completely untouched — `decideSwipeDirection`/`SWIPE_DISTANCE_THRESHOLD`/`SWIPE_VELOCITY_THRESHOLD` in `src/lib/swipeGesture.ts` are out of scope, per the spec decision that this only changes the in-drag *visual* reaction, not the commit decision. Only the `if (!last)` (mid-drag) branch gets the new directional guard.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Run the full test suite (regression check)**

Run: `npm test`
Expected: PASS — this change touches no `lib/` logic (only the visual drag handler in a component), so all existing tests should remain green. There is no existing test file for `SwipeCard.tsx` (components in this codebase are verified manually via Playwright, not vitest — see `src/lib/steam.test.ts` etc. for the pattern of what does get unit tests).

- [ ] **Step 5: Manual verification with Playwright (touch emulation)**

Start the dev server, open a swipe/Explore screen (solo or room), emulate a touch device viewport. Confirm:
- (a) A mostly-vertical drag/scroll gesture starting on the card's description text no longer triggers the "Gramy"/"Pas" glow poświata (the `likeOpacity`/`passOpacity`/`glowShadow` overlays stay off, card doesn't visibly shift horizontally) while the description still scrolls.
- (b) A clear horizontal swipe (left or right) still immediately shows the glow and rotates/moves the card as before — no regression to the existing swipe feel.
- (c) A swipe released past the existing commit threshold still fires `onSwipe` and animates the card off-screen, same as before this change (this is `decideSwipeDirection`, untouched).

- [ ] **Step 6: Commit**

```bash
git add src/components/swipe/SwipeCard.tsx
git commit -m "fix: add directional lock to swipe-card drag gesture"
```

---

### Task 2: Tag filter bar — selected tags jump to front, ad-hoc searched tags become visible (item B2)

**Files:**
- Modify: `src/components/swipe/TagFilterBar.tsx`

**Interfaces:**
- Consumes: nothing new (uses the existing `PINNED_TAGS`, `GENRE_PILLS`, `EXTRA_POPULAR_PILLS`, `STEAM_TAG_CATALOG`, `Pill` type already in this file).
- Produces: a new internal (unexported) `buildDisplayPills(selected: string[]): Pill[]` function.

- [ ] **Step 1: Add `buildDisplayPills`, replacing the static `allPills` list**

In `src/components/swipe/TagFilterBar.tsx`, add this function right after `pillClassName` (currently ending at line 72) and before the `TagFilterBar` component's JSDoc comment:

```typescript
/** Pigułki do wyrenderowania: (1) dołącza "ad-hoc" tagi zaznaczone przez
 * wyszukiwarkę, spoza PINNED_TAGS/GENRE_PILLS/EXTRA_POPULAR_PILLS -- bez tego
 * są zaznaczone w stanie, ale niewidoczne w pasku, jedyny sposób ich
 * odznaczenia był ponowne wyszukanie tej samej frazy; (2) sortuje całą listę
 * zaznaczone-najpierw, zachowując dotychczasową kolejność w obu grupach
 * (filter() jest stabilny) -- zaznaczona pigułka z dowolnej sekcji (nawet
 * przypięta) przeskakuje przed niezaznaczone, priorytet na widoczność
 * zaznaczenia nad hierarchią sekcji. */
function buildDisplayPills(selected: string[]): Pill[] {
  const basePills = [...PINNED_TAGS, ...GENRE_PILLS, ...EXTRA_POPULAR_PILLS];
  const knownValues = new Set(basePills.map((p) => p.value));
  const adHocPills: Pill[] = selected
    .filter((v) => !knownValues.has(v))
    .map((v) => ({ value: v, label: STEAM_TAG_CATALOG.find((t) => t.name === v)?.name ?? v, icon: null }));
  const combined = [...basePills, ...adHocPills];
  const selectedPills = combined.filter((p) => selected.includes(p.value));
  const restPills = combined.filter((p) => !selected.includes(p.value));
  return [...selectedPills, ...restPills];
}
```

Then change the line inside the `TagFilterBar` component (currently line 112) from:

```typescript
  const allPills = [...PINNED_TAGS, ...GENRE_PILLS, ...EXTRA_POPULAR_PILLS];
```

to:

```typescript
  const allPills = buildDisplayPills(value);
```

The rest of the component (the `.map((pill) => ...)` render below) is unchanged — it already reads from `allPills`.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 3: Manual verification with Playwright**

Start the dev server, open a swipe/Explore screen. Confirm:
- (a) Clicking an unpinned pill (e.g. a genre or popular tag) moves it to the very front of the row (before even the pinned "Kooperacja" pill if it's unselected), and unclicking it returns it to its original position among the unselected tags.
- (b) Open the tag search (magnifying-glass button), search for a tag NOT in the visible pill row (e.g. "Metroidvania" or another tag from the full 432-tag catalog not in the default visible set), select it from the dropdown — confirm it now appears as a pill at the front of the row (previously it would be selected in state but invisible in the row).
- (c) Click that same ad-hoc pill to deselect it — confirm it disappears from the row entirely (since it's not one of the base pills, once unselected it has no fixed slot to fall back into) and the filter clears.

- [ ] **Step 4: Commit**

```bash
git add src/components/swipe/TagFilterBar.tsx
git commit -m "fix: reorder tag filter bar to show selected tags first, including ad-hoc searched tags"
```

---

### Task 3: Simplify solo start screen — remove redundant multiplayer toggle, hide profile field until needed (items A1 + A2)

**Files:**
- Modify: `src/components/solo/SoloSettingsScreen.tsx`
- Modify: `src/components/solo/SoloHome.tsx`
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `onLoadLibrary`'s signature shrinks from `(source, profile, backlog, multiplayer) => void` to `(source, profile, backlog) => void`. `SoloSwipeScreen`'s prop union drops `multiplayerFilter`. `SoloHome`'s internal `Screen` union drops the `multiplayer` field from both `"swipe"` variants.

**Why both items land together:** A1 removes the "Jak chcesz grać?" toggle and the `multiplayer` value threaded through `onLoadLibrary` → `SoloHome`'s screen state → `SoloSwipeScreen`'s prop → `matchesMultiplayerFilter` call. That's one continuous chain across three files — splitting it into two tasks would leave an intermediate broken build. A2 (hiding the profile field) only touches `SoloSettingsScreen.tsx`, but it's the same file A1 already restructures, so it's folded into the same task to avoid two subagents editing overlapping JSX in the same render block.

- [ ] **Step 1: Remove the "Jak chcesz grać?" toggle and `multiplayer` state from `SoloSettingsScreen.tsx`, and restructure to hide the profile field behind "Eksploruj bibliotekę"**

In `src/components/solo/SoloSettingsScreen.tsx`, change the import (line 8) from:

```typescript
import { type BacklogFilter, type MultiplayerFilter } from "@/lib/steamLibrary";
```

to:

```typescript
import { type BacklogFilter } from "@/lib/steamLibrary";
```

Remove the `MULTIPLAYER_OPTIONS` constant entirely (currently lines 17-21):

```typescript
const MULTIPLAYER_OPTIONS: { value: MultiplayerFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "solo", label: "Jednoosobowe" },
  { value: "multi", label: "Wieloosobowe" },
];
```

Change the component's prop type (currently lines 23-31) from:

```typescript
export function SoloSettingsScreen({
  onLoadLibrary,
  loading,
  error,
}: {
  onLoadLibrary: (source: "library" | "catalog", profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) => void;
  loading: boolean;
  error: string | null;
}) {
```

to:

```typescript
export function SoloSettingsScreen({
  onLoadLibrary,
  loading,
  error,
}: {
  onLoadLibrary: (source: "library" | "catalog", profile: string, backlog: BacklogFilter) => void;
  loading: boolean;
  error: string | null;
}) {
```

Change the state declarations (currently lines 33-35) from:

```typescript
  const [profile, setProfile] = useState("");
  const [backlog, setBacklog] = useState<BacklogFilter>("never");
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("all");
```

to:

```typescript
  const [profile, setProfile] = useState("");
  const [backlog, setBacklog] = useState<BacklogFilter>("never");
  const [showLibrary, setShowLibrary] = useState(false);
```

Now replace the entire block from the profile input through the button grid (currently lines 93-137):

```typescript
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">Twój profil Steam</span>
          <input
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="https://steamcommunity.com/id/..."
            className="bg-card border-border rounded-xl border px-4 py-3 text-foreground"
          />
          <p className="text-text-secondary text-xs">
            Wklej link do profilu (steamcommunity.com/id/... lub /profiles/...) albo własną nazwę URL.
          </p>
        </div>

        {profile.trim() !== "" && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-foreground">Które gry pokazywać?</p>
            <ToggleChip value={backlog} options={BACKLOG_OPTIONS} onChange={setBacklog} columns={2} />
          </div>
        )}

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-foreground">Jak chcesz grać?</p>
          <ToggleChip value={multiplayer} options={MULTIPLAYER_OPTIONS} onChange={setMultiplayer} columns={3} />
        </div>

        {error && <p className="text-pass mt-4 text-sm">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => onLoadLibrary("catalog", profile.trim(), backlog, multiplayer)}
            className="bg-accent-brand rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
          >
            {loading ? "Wczytuję…" : "Eksploruj katalog"}
          </button>
          <button
            type="button"
            disabled={loading || !profile.trim()}
            onClick={() => onLoadLibrary("library", profile.trim(), backlog, multiplayer)}
            className="bg-accent-brand rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
          >
            {loading ? "Wczytuję…" : "Eksploruj bibliotekę"}
          </button>
        </div>
```

with:

```typescript
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => onLoadLibrary("catalog", "", backlog)}
              className="bg-accent-brand rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
            >
              {loading && !showLibrary ? "Wczytuję…" : "Eksploruj katalog"}
            </button>
            <p className="text-text-secondary text-center text-xs">Przeglądaj cały Steam</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setShowLibrary((v) => !v)}
              aria-pressed={showLibrary}
              className="bg-accent-brand rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
            >
              Eksploruj bibliotekę
            </button>
            <p className="text-text-secondary text-center text-xs">Tylko gry, które już masz</p>
          </div>
        </div>

        {showLibrary && (
          <div className="mt-5 flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">Twój profil Steam</span>
            <input
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="https://steamcommunity.com/id/..."
              className="bg-card border-border rounded-xl border px-4 py-3 text-foreground"
            />
            <p className="text-text-secondary text-xs">
              Wklej link do profilu (steamcommunity.com/id/... lub /profiles/...) albo własną nazwę URL.
            </p>

            {profile.trim() !== "" && (
              <div className="mt-3">
                <p className="mb-2 text-sm font-semibold text-foreground">Które gry pokazywać?</p>
                <ToggleChip value={backlog} options={BACKLOG_OPTIONS} onChange={setBacklog} columns={2} />
              </div>
            )}

            <button
              type="button"
              disabled={loading || !profile.trim()}
              onClick={() => onLoadLibrary("library", profile.trim(), backlog)}
              className="bg-accent-brand mt-3 rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
            >
              {loading ? "Wczytuję…" : "Wczytaj bibliotekę"}
            </button>
          </div>
        )}

        {error && <p className="text-pass mt-4 text-sm">{error}</p>}
```

Note: the intro paragraph above this block (currently line 89-91, "Wybierz jak chcesz przeglądać gry...") stays as-is, untouched — only the profile/backlog/multiplayer/button block gets replaced.

- [ ] **Step 2: Remove `multiplayer` from `SoloHome.tsx`'s screen state and prop threading**

In `src/components/solo/SoloHome.tsx`, change the import (lines 9-15) from:

```typescript
import {
  filterByPlaytime,
  shuffleGames,
  type BacklogFilter,
  type MultiplayerFilter,
  type SteamOwnedGame,
} from "@/lib/steamLibrary";
```

to:

```typescript
import {
  filterByPlaytime,
  shuffleGames,
  type BacklogFilter,
  type SteamOwnedGame,
} from "@/lib/steamLibrary";
```

Change the `Screen` type (lines 17-22) from:

```typescript
type Screen =
  | { name: "settings" }
  | { name: "swipe"; source: "library"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter }
  | { name: "swipe"; source: "catalog"; excludeAppIds: number[]; multiplayer: MultiplayerFilter }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };
```

to:

```typescript
type Screen =
  | { name: "settings" }
  | { name: "swipe"; source: "library"; pool: SteamOwnedGame[] }
  | { name: "swipe"; source: "catalog"; excludeAppIds: number[] }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };
```

Change `handleLoadLibrary`'s signature and body (lines 29-71) from:

```typescript
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
```

to:

```typescript
  async function handleLoadLibrary(source: "library" | "catalog", profile: string, backlog: BacklogFilter) {
    setLoading(true);
    setError(null);
    try {
      if (!profile) {
        // Katalog bez profilu -- nic do wykluczenia, prosto do Explore.
        setScreen({ name: "swipe", source: "catalog", excludeAppIds: [] });
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
        setScreen({ name: "swipe", source: "catalog", excludeAppIds: data.games.map((g) => g.steamAppId) });
        setLoading(false);
        return;
      }

      const filtered = filterByPlaytime(data.games, backlog);
      if (filtered.length === 0) {
        setError("Brak gier pasujących do tego filtra.");
        setLoading(false);
        return;
      }
      setScreen({ name: "swipe", source: "library", pool: shuffleGames(filtered) });
      setLoading(false);
    } catch {
      setError("Coś poszło nie tak. Spróbuj ponownie.");
      setLoading(false);
    }
  }
```

Change the two `SoloSwipeScreen` render calls (lines 73-95) from:

```typescript
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

to:

```typescript
  if (screen.name === "swipe" && screen.source === "library") {
    return (
      <SoloSwipeScreen
        source="library"
        pool={screen.pool}
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
        onExit={() => setScreen({ name: "settings" })}
        onViewLiked={() => setScreen({ name: "liked" })}
      />
    );
  }
```

- [ ] **Step 3: Remove `multiplayerFilter` prop and the `matchesMultiplayerFilter` call from `SoloSwipeScreen.tsx`**

In `src/components/solo/SoloSwipeScreen.tsx`, change the import (line 9) from:

```typescript
import { matchesMultiplayerFilter, type MultiplayerFilter, type SteamOwnedGame } from "@/lib/steamLibrary";
```

to:

```typescript
import type { SteamOwnedGame } from "@/lib/steamLibrary";
```

Change the prop union type (lines 23-25) from:

```typescript
type SoloSwipeProps =
  | { source: "library"; pool: SteamOwnedGame[]; multiplayerFilter: MultiplayerFilter; onExit: () => void; onViewLiked: () => void }
  | { source: "catalog"; excludeAppIds: number[]; multiplayerFilter: MultiplayerFilter; onExit: () => void; onViewLiked: () => void };
```

to:

```typescript
type SoloSwipeProps =
  | { source: "library"; pool: SteamOwnedGame[]; onExit: () => void; onViewLiked: () => void }
  | { source: "catalog"; excludeAppIds: number[]; onExit: () => void; onViewLiked: () => void };
```

Change line 28 from:

```typescript
  const { multiplayerFilter, onExit, onViewLiked } = props;
```

to:

```typescript
  const { onExit, onViewLiked } = props;
```

Remove the multiplayer filter check (currently line 93), from:

```typescript
        const tags = data.tags ?? [];
        if (!matchesMultiplayerFilter(tags, multiplayerFilter)) continue;
        const realTags = genreFilter.filter((v) => v !== NEW_RELEASE_TAG && v !== UPCOMING_TAG);
```

to:

```typescript
        const tags = data.tags ?? [];
        const realTags = genreFilter.filter((v) => v !== NEW_RELEASE_TAG && v !== UPCOMING_TAG);
```

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors. This is the step that actually catches any missed call site — if any of the three files still references `multiplayer`/`multiplayerFilter`/`MultiplayerFilter` inconsistently, this will fail.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — `steamLibrary.test.ts` still tests `matchesMultiplayerFilter` directly (unrelated to this change, the function itself is untouched), and no other test references the removed prop/state.

- [ ] **Step 6: Manual verification with Playwright**

Start the dev server, navigate to `/`. Confirm:
- (a) The profile input is NOT visible on load — only two buttons ("Eksploruj katalog" / "Eksploruj bibliotekę") each with a one-line caption underneath, and no "Jak chcesz grać?" toggle anywhere on the page.
- (b) Clicking "Eksploruj katalog" immediately navigates to the catalog Explore screen (no profile required), same as before this change.
- (c) Clicking "Eksploruj bibliotekę" reveals the profile input in place (page doesn't navigate away) with the same explanatory caption text as before, and once a profile is entered, the "Które gry pokazywać?" backlog toggle appears and a "Wczytaj bibliotekę" button becomes enabled; clicking it (with a real Steam profile if available) navigates to the library Explore screen.
- (d) On the library/catalog swipe screens, confirm the "Kooperacja"/"Multiplayer" pills in the tag bar still work as filters (this was already true before this task — just confirming no regression from removing the old separate multiplayer toggle).

- [ ] **Step 7: Commit**

```bash
git add src/components/solo/SoloSettingsScreen.tsx src/components/solo/SoloHome.tsx src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: remove redundant multiplayer toggle, hide profile field until Eksploruj bibliotekę is clicked"
```

---

## Self-Review Notes

- **Spec coverage:** E (§E, gesture directional lock) → Task 1. B2 (§B2, tag reorder + ad-hoc visibility) → Task 2. A1 (§A1, remove multiplayer toggle) + A2 (§A2, hide profile field) → Task 3. All four items from "Priorytet wykonania" group 2 covered. B3 and A3 (group 3, "requires additional recon") and C2/C3/F (group 4) are explicitly out of scope for this plan.
- **Placeholder scan:** none found — every step has concrete code.
- **Type consistency:** `onLoadLibrary`'s new 3-arg signature (`source, profile, backlog`) is identical between `SoloSettingsScreen`'s prop type and `SoloHome`'s `handleLoadLibrary` definition. `Screen` union's dropped `multiplayer` field is consistent across both `"swipe"` variants and both call sites. `buildDisplayPills` returns `Pill[]`, matching the type already used by `allPills`'s consumers (the `.map()` render loop expects `{ value, label, icon }`).
- **A2 UI decision:** the plan makes "Eksploruj bibliotekę" a reveal-toggle (matching the existing `showCreate`/`showJoin` pattern in the same file) rather than an immediate-submit button, since the profile field must exist before that button can mean "load." The spec explicitly leaves exact wording/layout to implementation ("Dokładne brzmienie do dopracowania przy implementacji") — this plan's copy ("Przeglądaj cały Steam" / "Tylko gry, które już masz" / "Wczytaj bibliotekę") follows the spec's own suggested phrasing verbatim where given, and fills the one gap (the new submit button's label, since "Eksploruj bibliotekę" is now the reveal-toggle's label) with "Wczytaj bibliotekę" — flagged here in case the implementer or reviewer prefers different wording.
