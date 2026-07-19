# UX Backlog Group 1 (D + C1 + B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three lowest-risk items from the 2026-07-18 UX feedback backlog: more Steam reviews with a "show more" toggle (D), a back button on the Versus screen (C1), and a left-scroll/scroll-to-start control on the tag filter bar (B1).

**Architecture:** Each item is an isolated change to a single existing file (plus its test where applicable) — no new files, no data model changes, no Firestore rule changes. Follows patterns already established in the codebase (`HistoryScreen.tsx`/`LocalVersusScreen.tsx` back-button style, existing `scrollRight`/`ChevronRight` pattern in `TagFilterBar.tsx`).

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, Vitest, lucide-react icons.

## Global Constraints

- No new npm dependencies (spec explicitly rules this out for every item in this group).
- Match existing visual patterns exactly: back button = `bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground`, `aria-label="Wstecz"`, `‹` glyph (see `HistoryScreen.tsx:32-38`, `LocalVersusScreen.tsx:36-43`).
- Source spec: `docs/superpowers/specs/2026-07-18-ux-feedback-backlog-design.md` sections D, C1, B1.
- Full source doc (project roadmap/context): `work/active/Tumolec.md` in the Obsidian vault at `C:\Users\miros\Desktop\RUFLO`.

---

### Task 1: More Steam reviews (10 instead of 3) with "show more" toggle

**Files:**
- Modify: `src/lib/steam.ts:104` (`TOP_REVIEW_COUNT` constant)
- Modify: `src/lib/steam.test.ts:105-124` (existing test needs updating, plus one new test)
- Modify: `src/components/swipe/ReleaseOrReviewsPanel.tsx`

**Interfaces:**
- Consumes: `SteamCacheEntry.topReviews` (already `{ author, text, votedUp }[]`, unchanged shape) from `src/lib/steam.ts`.
- Produces: no new exports. `TOP_REVIEW_COUNT` goes from 3 to 10; `ReleaseOrReviewsPanel` gains internal `showAll` state, no prop changes.

- [ ] **Step 1: Update the existing "caps at 3" test to reflect uncapped-at-4 behavior**

Replace the test at `src/lib/steam.test.ts:105-124`:

```typescript
  it("picks top reviews by votes_up and truncates long text", () => {
    const data = { name: "Hades", header_image: "", short_description: "", pc_requirements: {} };
    const longText = "a".repeat(300);
    const reviews = {
      query_summary: { review_score_desc: "", total_positive: 0, total_reviews: 0 },
      reviews: [
        { review: "low votes", voted_up: true, votes_up: 1, author: { personaname: "Low" } },
        { review: longText, voted_up: true, votes_up: 50, author: { personaname: "Top" } },
        { review: "mid votes", voted_up: false, votes_up: 10, author: { personaname: "Mid" } },
        { review: "fourth", voted_up: true, votes_up: 5, author: { personaname: "Fourth" } },
      ],
    };

    const result = parseSteamAppDetails(1145360, data, reviews);

    expect(result.topReviews).toHaveLength(4);
    expect(result.topReviews[0]).toEqual({ author: "Top", text: "a".repeat(280) + "…", votedUp: true });
    expect(result.topReviews[1]).toEqual({ author: "Mid", text: "mid votes", votedUp: false });
    expect(result.topReviews[2].author).toBe("Fourth");
    expect(result.topReviews[3].author).toBe("Low");
  });

  it("caps top reviews at 10", () => {
    const data = { name: "Hades", header_image: "", short_description: "", pc_requirements: {} };
    const reviews = {
      query_summary: { review_score_desc: "", total_positive: 0, total_reviews: 0 },
      reviews: Array.from({ length: 12 }, (_, i) => ({
        review: `review ${i}`,
        voted_up: true,
        votes_up: 12 - i,
        author: { personaname: `Author${i}` },
      })),
    };

    const result = parseSteamAppDetails(1145360, data, reviews);

    expect(result.topReviews).toHaveLength(10);
    expect(result.topReviews[0].author).toBe("Author0");
    expect(result.topReviews[9].author).toBe("Author9");
  });
```

- [ ] **Step 2: Run the test suite to verify it currently fails on the cap-at-10 test**

Run: `npm test -- steam.test.ts`
Expected: FAIL — `caps top reviews at 10` fails because `TOP_REVIEW_COUNT` is still 3 (`result.topReviews` has length 3, not 10). The renamed "truncates long text" test also fails (expects length 4, gets 3).

- [ ] **Step 3: Bump `TOP_REVIEW_COUNT` to 10**

In `src/lib/steam.ts:104`, change:

```typescript
const TOP_REVIEW_COUNT = 3;
```

to:

```typescript
const TOP_REVIEW_COUNT = 10;
```

- [ ] **Step 4: Run the test suite to verify it passes**

Run: `npm test -- steam.test.ts`
Expected: PASS — all tests in `steam.test.ts` green.

- [ ] **Step 5: Add "show more" toggle to `ReleaseOrReviewsPanel.tsx`**

In `src/components/swipe/ReleaseOrReviewsPanel.tsx`, change the import line:

```typescript
import { ThumbsDown, ThumbsUp } from "lucide-react";
```

to:

```typescript
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
```

Then replace the reviews block (currently lines 53-69):

```typescript
      {game.topReviews.length > 0 && (
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {game.topReviews.map((review, i) => (
            <div key={i} className="bg-secondary rounded-xl p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{review.author}</span>
                {review.votedUp ? (
                  <ThumbsUp className="text-rating h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ThumbsDown className="text-pass h-3.5 w-3.5 shrink-0" />
                )}
              </div>
              <p className="text-text-secondary text-xs leading-snug whitespace-pre-line">{review.text}</p>
            </div>
          ))}
        </div>
      )}
```

with:

```typescript
      {game.topReviews.length > 0 && (
        <ReviewsList reviews={game.topReviews} />
      )}
```

Then add a new component below `ReleaseOrReviewsPanel` (still in the same file, after its closing brace):

```typescript
const VISIBLE_REVIEW_COUNT = 3;

function ReviewsList({ reviews }: { reviews: SwipeGame["topReviews"] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? reviews : reviews.slice(0, VISIBLE_REVIEW_COUNT);

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
      {visible.map((review, i) => (
        <div key={i} className="bg-secondary rounded-xl p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">{review.author}</span>
            {review.votedUp ? (
              <ThumbsUp className="text-rating h-3.5 w-3.5 shrink-0" />
            ) : (
              <ThumbsDown className="text-pass h-3.5 w-3.5 shrink-0" />
            )}
          </div>
          <p className="text-text-secondary text-xs leading-snug whitespace-pre-line">{review.text}</p>
        </div>
      ))}
      {!showAll && reviews.length > VISIBLE_REVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-accent-brand text-center text-xs font-semibold"
        >
          Pokaż więcej recenzji
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the build to catch type errors**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors (in particular, `SwipeGame["topReviews"]` must resolve — `SwipeGame` is already imported in this file).

- [ ] **Step 7: Manual verification with Playwright**

Start the dev server (`npm run dev`), navigate to a room/solo swipe screen for a game with more than 3 reviews cached (or clear `steam_cache` entry to force refetch with the new count), open the reviews panel, confirm: 3 reviews shown by default, "Pokaż więcej recenzji" button appears, clicking it reveals up to 10 reviews and the button disappears.

- [ ] **Step 8: Commit**

```bash
git add src/lib/steam.ts src/lib/steam.test.ts src/components/swipe/ReleaseOrReviewsPanel.tsx
git commit -m "feat: show up to 10 Steam reviews with a show-more toggle"
```

---

### Task 2: Back button on Versus screen (room mode)

**Files:**
- Modify: `src/components/room/EliminationRound.tsx`
- Modify: `src/components/room/VersusScreen.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EliminationRound` gains an optional `backHref?: string` prop (threaded through to internal `RoundVoting`). `SwipeScreen.tsx` (the other caller) is unaffected since it doesn't pass `backHref` — its header renders exactly as before.

- [ ] **Step 1: Add `backHref` prop to `EliminationRound` and thread it to `RoundVoting`**

In `src/components/room/EliminationRound.tsx`, add the import:

```typescript
import Link from "next/link";
```

alongside the existing imports at the top of the file.

Change the `EliminationRound` function signature (around line 31-41) from:

```typescript
export function EliminationRound({
  roomCode,
  initialPool,
  gameByAppId,
  emptyMessage,
}: {
  roomCode: string;
  initialPool: number[];
  gameByAppId: Map<number, SwipeGame>;
  emptyMessage: string;
}) {
```

to:

```typescript
export function EliminationRound({
  roomCode,
  initialPool,
  gameByAppId,
  emptyMessage,
  backHref,
}: {
  roomCode: string;
  initialPool: number[];
  gameByAppId: Map<number, SwipeGame>;
  emptyMessage: string;
  backHref?: string;
}) {
```

Change the `<RoundVoting .../>` call (around line 92-103) from:

```typescript
  return (
    <RoundVoting
      key={`${session.sessionId}-${session.roundNumber}`}
      roomCode={roomCode}
      sessionId={session.sessionId}
      roundNumber={session.roundNumber}
      participantId={participantId}
      participants={participants}
      gameByAppId={gameByAppId}
      onAdvance={() => setSession((s) => (s ? { ...s, roundNumber: s.roundNumber + 1 } : s))}
    />
  );
```

to:

```typescript
  return (
    <RoundVoting
      key={`${session.sessionId}-${session.roundNumber}`}
      roomCode={roomCode}
      sessionId={session.sessionId}
      roundNumber={session.roundNumber}
      participantId={participantId}
      participants={participants}
      gameByAppId={gameByAppId}
      backHref={backHref}
      onAdvance={() => setSession((s) => (s ? { ...s, roundNumber: s.roundNumber + 1 } : s))}
    />
  );
```

- [ ] **Step 2: Add `backHref` to `RoundVoting`'s props and render the back button when present**

Change the `RoundVoting` function signature (around line 106-122) from:

```typescript
function RoundVoting({
  roomCode,
  sessionId,
  roundNumber,
  participantId,
  participants,
  gameByAppId,
  onAdvance,
}: {
  roomCode: string;
  sessionId: string;
  roundNumber: number;
  participantId: string;
  participants: Participant[];
  gameByAppId: Map<number, SwipeGame>;
  onAdvance: () => void;
}) {
```

to:

```typescript
function RoundVoting({
  roomCode,
  sessionId,
  roundNumber,
  participantId,
  participants,
  gameByAppId,
  backHref,
  onAdvance,
}: {
  roomCode: string;
  sessionId: string;
  roundNumber: number;
  participantId: string;
  participants: Participant[];
  gameByAppId: Map<number, SwipeGame>;
  backHref?: string;
  onAdvance: () => void;
}) {
```

Change the header markup (around line 185-189), from:

```typescript
  return (
    <div className="flex h-dvh flex-col">
      <p className="text-text-secondary pt-6 pb-2 text-center text-xs tracking-widest">
        RUNDA {roundNumber} · GRA {Math.min(round.poolAtStart.length - myDeck.length + 1, round.poolAtStart.length)} Z {round.poolAtStart.length}
      </p>
```

to:

```typescript
  const progressText = `RUNDA ${roundNumber} · GRA ${Math.min(round.poolAtStart.length - myDeck.length + 1, round.poolAtStart.length)} Z ${round.poolAtStart.length}`;

  return (
    <div className="flex h-dvh flex-col">
      {backHref ? (
        <div className="flex items-center gap-3 px-[22px] pt-[18px] pb-2">
          <Link
            href={backHref}
            aria-label="Wstecz"
            className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
          >
            ‹
          </Link>
          <p className="text-text-secondary flex-1 text-center text-xs tracking-widest">{progressText}</p>
        </div>
      ) : (
        <p className="text-text-secondary pt-6 pb-2 text-center text-xs tracking-widest">{progressText}</p>
      )}
```

Note: this `return` statement's JSX continues below (the `<main>`, tie-breaker, and action buttons blocks) — do not touch those, only the opening `<div className="flex h-dvh flex-col">` and the header element right after it.

- [ ] **Step 3: Pass `backHref` from `VersusScreen.tsx`**

In `src/components/room/VersusScreen.tsx`, change:

```typescript
  return (
    <EliminationRound
      roomCode={roomCode}
      initialPool={liked.map((g) => g.steamAppId)}
      gameByAppId={gameByAppId}
      emptyMessage="Polub co najmniej 2 gry w Explore, zanim zaczniesz Versus."
    />
  );
```

to:

```typescript
  return (
    <EliminationRound
      roomCode={roomCode}
      initialPool={liked.map((g) => g.steamAppId)}
      gameByAppId={gameByAppId}
      emptyMessage="Polub co najmniej 2 gry w Explore, zanim zaczniesz Versus."
      backHref={`/room/${roomCode}`}
    />
  );
```

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Run the full test suite (regression check)**

Run: `npm test`
Expected: PASS — this change touches no logic in `lib/`, only JSX/props, so all existing tests should remain green.

- [ ] **Step 6: Manual verification with Playwright**

Start the dev server, create/join a room, like at least 2 games, navigate to `/room/{code}/versus`. Confirm: back button (`‹`, `aria-label="Wstecz"`) appears at the top-left next to the "RUNDA 1 · GRA X Z Y" text, clicking it navigates to `/room/{code}` (lobby), and the elimination round itself is unaffected (swipe still works, progress text still centered). Then navigate to `/room/{code}/swipe` (the pool-based `SwipeScreen`) and confirm its header is unchanged (no back button, same centered text as before — this route doesn't pass `backHref`).

- [ ] **Step 7: Commit**

```bash
git add src/components/room/EliminationRound.tsx src/components/room/VersusScreen.tsx
git commit -m "feat: add back button to room Versus screen"
```

---

### Task 3: Left-scroll and scroll-to-start buttons on the tag filter bar

**Files:**
- Modify: `src/components/swipe/TagFilterBar.tsx`

**Interfaces:**
- Consumes: nothing new (uses the existing `scrollRef` already defined in this component).
- Produces: no new exports, purely internal UI addition.

- [ ] **Step 1: Import the two new icons**

In `src/components/swipe/TagFilterBar.tsx`, change the lucide-react import (lines 4-20) from:

```typescript
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
```

to:

```typescript
import {
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
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
```

- [ ] **Step 2: Add `scrollLeft` and `scrollToStart` functions**

Change (lines 92-94):

```typescript
  function scrollRight() {
    scrollRef.current?.scrollBy({ left: SCROLL_STEP_PX, behavior: "smooth" });
  }
```

to:

```typescript
  function scrollRight() {
    scrollRef.current?.scrollBy({ left: SCROLL_STEP_PX, behavior: "smooth" });
  }

  function scrollLeft() {
    scrollRef.current?.scrollBy({ left: -SCROLL_STEP_PX, behavior: "smooth" });
  }

  function scrollToStart() {
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }
```

- [ ] **Step 3: Render the two new buttons before the scrollable pill list, hidden on touch/mobile**

Change the row markup (lines 106-136), from:

```typescript
      <div className="flex items-center gap-1.5">
        <div
          ref={scrollRef}
          className="flex flex-1 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
```

to:

```typescript
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={scrollToStart}
          aria-label="Przewiń na początek"
          className="bg-secondary hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground md:flex"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={scrollLeft}
          aria-label="Przewiń w lewo"
          className="bg-secondary hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground md:flex"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          ref={scrollRef}
          className="flex flex-1 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
```

(The rest of the row — the pill list rendering, the existing `ChevronRight` "scroll right" button, and the search toggle button — stays exactly as-is, unchanged.)

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript/lint errors (unused-import checks pass since both new icons are now used).

- [ ] **Step 5: Manual verification with Playwright**

Start the dev server, open a swipe/Explore screen on a desktop-sized viewport (≥768px, i.e. `md` breakpoint), confirm two new circular buttons (scroll-to-start, scroll-left) appear to the left of the tag pill row, and that clicking scroll-right then scroll-left moves the pill row appropriately, and scroll-to-start jumps back to the first pill instantly. Then resize/emulate a mobile viewport (<768px) and confirm both new buttons are hidden (only the pill row + existing right-scroll + search buttons remain, matching current mobile behavior).

- [ ] **Step 6: Commit**

```bash
git add src/components/swipe/TagFilterBar.tsx
git commit -m "feat: add left-scroll and scroll-to-start buttons to tag filter bar"
```

---

## Self-Review Notes

- **Spec coverage:** D (reviews, §D) → Task 1. C1 (Versus back button, §C1) → Task 2. B1 (tag bar left-scroll, §B1) → Task 3. All three items from "Priorytet wykonania" group 1 covered. Nothing else from group 1 was specified.
- **Placeholder scan:** none found — every step has concrete code.
- **Type consistency:** `backHref?: string` name and type match between `EliminationRound` and `RoundVoting` in Task 2. `ReviewsList`'s `reviews` prop type (`SwipeGame["topReviews"]`) matches the actual field type in `src/lib/types.ts` (already `{ author: string; text: string; votedUp: boolean }[]`, inherited from `SteamCacheEntry`).
