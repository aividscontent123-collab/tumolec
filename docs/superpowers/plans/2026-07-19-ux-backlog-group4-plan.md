# UX Backlog Group 4 (C2 + C3 + F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the last tier of the 2026-07-18 UX feedback backlog — the items with the most moving parts (Firestore sync, multiple participants): a non-blocking "X started Versus" notification (C2), a "reroll" button after a Versus result that restarts the bracket for everyone in the room (C3), and a "compare libraries" entry point during active Explore browsing (F).

**Architecture:** All three reuse existing Firestore patterns already established in this codebase rather than inventing new ones:
- C2 and C3 both add a new field to the existing shared `rooms/{roomCode}/session/state` document (the same doc already holding `coinflip`/`wheel`/`plinko`/`exploreGenreFilter`), always written with `{ merge: true }` on just that one field — this document's Firestore rule is already `allow write: if true` (unconditional, low-risk per its own comment), so **neither task requires a `firestore.rules` change**.
- C3's room-side reroll deliberately does NOT invent new elimination-round logic. It reuses `EliminationRound.tsx`'s **existing** bootstrap-a-fresh-session code path (already used for the very first Versus entry) and its **existing** round-1 multi-client sessionId-convergence reconciliation (already used to resolve two clients racing to start round 1 concurrently) — the only new code is a signal that tells every client's local `session` state to reset to `null`, which makes both of those already-tested mechanisms run again naturally.
- F reuses the existing `SharedLibrarySection` component and `computeSharedLibrary` function unchanged in behavior — it only adds a new opt-in prop for an explicit empty-state message (instead of silently rendering nothing), and a new toggle button to surface that same component during active Explore browsing (it already exists on `GamePoolScreen.tsx`; this task doesn't touch that page).

**Tech Stack:** Next.js 16, TypeScript, Firebase Firestore, Vitest.

## Global Constraints

- No new npm dependencies.
- No `firestore.rules` changes needed for C2/C3 (the `session/state` document is already unconditionally writable). F needs no rules changes either (no new fields, no new collections).
- Source spec: `docs/superpowers/specs/2026-07-18-ux-feedback-backlog-design.md` sections C2, C3, F.
- Full source doc (project roadmap/context, including prior real bugs found in this exact area — Firestore rules gaps for `tieBreak`, round-1 concurrency races): `work/active/Tumolec.md` in the Obsidian vault at `C:\Users\miros\Desktop\RUFLO`. Read this before assuming a "such-and-such can't happen" — this project has twice found real production concurrency bugs in the elimination-round code specifically.

---

### Task 1: Non-blocking "X started Versus" notification (item C2)

**Files:**
- Modify: `src/lib/rooms.ts`
- Modify: `src/components/room/LikedScreen.tsx`
- Modify: `src/components/room/RoomLobby.tsx`

**Interfaces:**
- Produces: `VersusStartSignal = { triggeredBy: string; triggeredAt: Timestamp }`, `signalVersusStart(roomCode: string, triggeredBy: string): Promise<void>`, `subscribeToVersusStart(roomCode: string, onChange: (signal: VersusStartSignal | null) => void): Unsubscribe` — all new exports from `src/lib/rooms.ts`.
- Scope decision: the banner is shown on `RoomLobby.tsx` only (the one screen every participant returns to and is most likely to be sitting on) — not injected into every room screen via a new shared layout, which would be a much larger architectural change for a small, low-traffic feature. This matches the spec's own openness on exact placement ("Dokładny kształt danych... do ustalenia przy planowaniu").

- [ ] **Step 1: Add the Firestore read/write functions**

In `src/lib/rooms.ts`, add this new section right after the "Filtr gatunków Explore (pokój)" section (currently ending at line 412, right before the "Paczki gier" section comment):

```typescript
// ── Powiadomienie o starcie Versus ──────────────────────────────────────
// TEN SAM dokument `rooms/{roomCode}/session/state` co coinflip/wheel/plinko/
// exploreGenreFilter -- `setDoc(..., { merge: true })` na samym polu
// `versusStart`, nigdy nadpisanie całego dokumentu. Nieblokujące: kliknięcie
// "Rozpocznij Versus" i tak od razu przenosi klikającego, to pole tylko
// informuje resztę uczestników przez realtime listener.

export type VersusStartSignal = { triggeredBy: string; triggeredAt: Timestamp };

export async function signalVersusStart(roomCode: string, triggeredBy: string) {
  await setDoc(
    doc(db, "rooms", roomCode, "session", "state"),
    { versusStart: { triggeredBy, triggeredAt: serverTimestamp() } },
    { merge: true },
  );
}

export function subscribeToVersusStart(
  roomCode: string,
  onChange: (signal: VersusStartSignal | null) => void,
) {
  return onSnapshot(doc(db, "rooms", roomCode, "session", "state"), (snap) => {
    onChange(snap.exists() ? ((snap.data().versusStart as VersusStartSignal | undefined) ?? null) : null);
  });
}
```

- [ ] **Step 2: Fire the signal when "Rozpocznij Versus" is clicked**

In `src/components/room/LikedScreen.tsx`, change the imports (currently line 1-9) from:

```typescript
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { subscribeToLiked, unlikeGame, likeGame, type LikedGame } from "@/lib/rooms";
import { AddGameForm } from "@/components/room/AddGameForm";
import { useParticipant } from "@/lib/useParticipant";
import { cn } from "@/lib/utils";
```

to:

```typescript
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { subscribeToLiked, unlikeGame, likeGame, signalVersusStart, type LikedGame } from "@/lib/rooms";
import { AddGameForm } from "@/components/room/AddGameForm";
import { useParticipant } from "@/lib/useParticipant";
import { cn } from "@/lib/utils";
```

Add `const router = useRouter();` right after the `useParticipant` line (currently line 12: `const { participantId } = useParticipant(roomCode);`):

```typescript
  const { participantId } = useParticipant(roomCode);
  const router = useRouter();
```

Change the "Rozpocznij Versus" link (currently lines 69-80) from:

```typescript
      <Link
        href={`/room/${roomCode}/versus`}
        aria-disabled={games.length < 2}
        className={cn(
          "rounded-full py-3 text-center text-sm font-bold",
          games.length >= 2
            ? "bg-accent-brand text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
            : "bg-secondary text-text-secondary pointer-events-none",
        )}
      >
        {games.length >= 2 ? "Rozpocznij Versus →" : "Polub co najmniej 2 gry"}
      </Link>
```

to:

```typescript
      <button
        type="button"
        disabled={games.length < 2}
        onClick={() => {
          if (participantId) signalVersusStart(roomCode, participantId);
          router.push(`/room/${roomCode}/versus`);
        }}
        className={cn(
          "rounded-full py-3 text-center text-sm font-bold",
          games.length >= 2
            ? "bg-accent-brand text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
            : "bg-secondary text-text-secondary",
        )}
      >
        {games.length >= 2 ? "Rozpocznij Versus →" : "Polub co najmniej 2 gry"}
      </button>
```

Note: this changes the element from `<Link>` to `<button>` because navigation now needs a side effect (writing the signal) before/alongside it — `disabled` on a real `<button>` already prevents clicks without needing the `pointer-events-none`/`aria-disabled` workaround the old `<Link>` needed.

- [ ] **Step 3: Show the banner in `RoomLobby.tsx`**

In `src/components/room/RoomLobby.tsx`, change the import (currently line 5) from:

```typescript
import { subscribeToParticipants, subscribeToRoom, joinRoom, type Participant } from "@/lib/rooms";
```

to:

```typescript
import {
  subscribeToParticipants,
  subscribeToRoom,
  joinRoom,
  subscribeToVersusStart,
  type Participant,
  type VersusStartSignal,
} from "@/lib/rooms";
```

Add a new state variable and subscription. Change the state declarations (currently lines 16-21) from:

```typescript
  const [roomName, setRoomName] = useState<string | null | undefined>(undefined);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [joinNickname, setJoinNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinProfile, setJoinProfile] = useState("");
  const [joinBacklog, setJoinBacklog] = useState<BacklogFilter>("never");
```

to:

```typescript
  const [roomName, setRoomName] = useState<string | null | undefined>(undefined);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [versusStart, setVersusStart] = useState<VersusStartSignal | null>(null);
  const [joinNickname, setJoinNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinProfile, setJoinProfile] = useState("");
  const [joinBacklog, setJoinBacklog] = useState<BacklogFilter>("never");
```

Change the subscription effect (currently lines 24-31) from:

```typescript
  useEffect(() => {
    const unsubRoom = subscribeToRoom(roomCode, (data) => setRoomName(data?.name ?? null));
    const unsubParticipants = subscribeToParticipants(roomCode, setParticipants);
    return () => {
      unsubRoom();
      unsubParticipants();
    };
  }, [roomCode]);
```

to:

```typescript
  useEffect(() => {
    const unsubRoom = subscribeToRoom(roomCode, (data) => setRoomName(data?.name ?? null));
    const unsubParticipants = subscribeToParticipants(roomCode, setParticipants);
    const unsubVersusStart = subscribeToVersusStart(roomCode, setVersusStart);
    return () => {
      unsubRoom();
      unsubParticipants();
      unsubVersusStart();
    };
  }, [roomCode]);
```

Add a staleness constant near the top of the file, right after `const AVATAR_COLORS = [...]` (currently line 12):

```typescript
const AVATAR_COLORS = ["#c2703d", "#2fb3a0", "#8b5cf6", "#e05e8f"];
const VERSUS_START_STALE_MS = 5 * 60 * 1000; // baner znika po 5 minutach, żeby nie wisieć wiecznie po jednorazowym starcie
```

Add the banner to the joined-participant view. Change (currently lines 117-124):

```typescript
  return (
    <main className="flex h-dvh flex-col px-[22px] pt-[18px] pb-[30px]">
      <h1 className="font-heading text-center text-[22px] font-bold text-foreground">
        {roomName}
      </h1>
      <p className="text-text-secondary mb-6 text-center text-xs tracking-widest">
        KOD POKOJU: {roomCode}
      </p>
```

to:

```typescript
  const versusStarter =
    versusStart && versusStart.triggeredBy !== participantId && Date.now() - versusStart.triggeredAt.toMillis() < VERSUS_START_STALE_MS
      ? participants.find((p) => p.participantId === versusStart.triggeredBy)?.nickname
      : null;

  return (
    <main className="flex h-dvh flex-col px-[22px] pt-[18px] pb-[30px]">
      <h1 className="font-heading text-center text-[22px] font-bold text-foreground">
        {roomName}
      </h1>
      <p className="text-text-secondary mb-6 text-center text-xs tracking-widest">
        KOD POKOJU: {roomCode}
      </p>

      {versusStarter && (
        <div className="bg-accent-brand/15 border-accent-brand mb-4 flex items-center justify-between gap-3 rounded-xl border p-3">
          <span className="text-sm text-foreground">{versusStarter} rozpoczyna Versus</span>
          <Link
            href={`/room/${roomCode}/versus`}
            className="bg-accent-brand shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white"
          >
            Dołącz
          </Link>
        </div>
      )}
```

Note: `versusStarter` falls back to `undefined` (from `.find(...)?.nickname`) if the triggering participant somehow isn't in the current `participants` list — the banner text would render "undefined rozpoczyna Versus" in that edge case. Add a fallback: change `participants.find((p) => p.participantId === versusStart.triggeredBy)?.nickname` to `participants.find((p) => p.participantId === versusStart.triggeredBy)?.nickname ?? "Ktoś"`.

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Run the full test suite (regression check)**

Run: `npm test`
Expected: PASS — no `lib/` pure-function logic changed, only Firestore I/O wrappers (untested by convention in this codebase, matching `triggerCoinflip`/`triggerWheelSpin`'s existing untested boundary) and component JSX.

- [ ] **Step 6: Manual verification with Playwright**

Start the dev server. Open the SAME room in two separate browser contexts/tabs as two different participants (e.g. via two Playwright browser contexts, or one real browser tab + one Playwright-driven tab), both starting on the room lobby. In tab A, like 2+ games and click "Rozpocznij Versus →". Confirm:
- (a) Tab A navigates to `/room/{code}/versus` immediately (no behavior change from before).
- (b) Tab B (still on the lobby) shows the "{nickname A} rozpoczyna Versus" banner with a "Dołącz" button within a few seconds (Firestore realtime propagation), without any page refresh needed.
- (c) Clicking "Dołącz" in tab B navigates to `/room/{code}/versus` and joins the same in-progress round.
- (d) The banner does NOT appear in tab A itself (the triggering participant doesn't see a banner about their own action).

- [ ] **Step 7: Commit**

```bash
git add src/lib/rooms.ts src/components/room/LikedScreen.tsx src/components/room/RoomLobby.tsx
git commit -m "feat: notify other room participants when someone starts Versus"
```

---

### Task 2: "Przelosuj" (reroll) button after a Versus result (item C3)

**Files:**
- Modify: `src/lib/useLocalVersus.ts`
- Modify: `src/components/room/WinnerScreen.tsx`
- Modify: `src/components/solo/LocalVersusScreen.tsx`
- Modify: `src/lib/rooms.ts`
- Modify: `src/components/room/EliminationRound.tsx`
- Modify: `src/components/room/VersusScreen.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 (independent Firestore field, independent files — `rooms.ts` and `RoomLobby.tsx`/`LikedScreen.tsx` from Task 1 are untouched here except `rooms.ts`, which gets one more independent addition alongside Task 1's, not a conflicting edit to the same lines).
- Produces: `WinnerScreen` gains an optional `onReroll?: () => void` prop. `useLocalVersus` gains a `restart(): void` return value. `EliminationRound` gains an optional `allowReroll?: boolean` prop (opt-in, so `SwipeScreen.tsx` — the other caller, pool-based not Versus-based — is completely unaffected since it doesn't pass this prop). `rooms.ts` gains `triggerReroll(roomCode: string): Promise<void>` and `subscribeToRerollSignal(...)`.

- [ ] **Step 1: Add a `restart` function to `useLocalVersus` (solo)**

In `src/lib/useLocalVersus.ts`, change the return statement (currently line 73) from:

```typescript
  return { pool, deck, poolSize: pool.length, winner, vote, tieBreak, startTieBreak, resolveTieBreak };
```

to:

```typescript
  function restart() {
    setPool(initialPool);
    setSwipes([]);
    setWinner(null);
    setTieBreak(null);
  }

  return { pool, deck, poolSize: pool.length, winner, vote, tieBreak, startTieBreak, resolveTieBreak, restart };
```

- [ ] **Step 2: Add the reroll button to `WinnerScreen`**

In `src/components/room/WinnerScreen.tsx`, change the component signature (currently line 19) from:

```typescript
export function WinnerScreen({ game }: { game: SwipeGame | undefined }) {
```

to:

```typescript
export function WinnerScreen({ game, onReroll }: { game: SwipeGame | undefined; onReroll?: () => void }) {
```

Change the closing block (currently lines 65-76) from:

```typescript
      <motion.a
        href={`https://store.steampowered.com/app/${game.steamAppId}`}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="bg-accent-brand rounded-full px-8 py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
      >
        Zobacz na Steam
      </motion.a>
    </main>
  );
}
```

to:

```typescript
      <motion.a
        href={`https://store.steampowered.com/app/${game.steamAppId}`}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="bg-accent-brand rounded-full px-8 py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
      >
        Zobacz na Steam
      </motion.a>

      {onReroll && (
        <motion.button
          type="button"
          onClick={onReroll}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-secondary rounded-full px-8 py-3 text-sm font-bold text-foreground"
        >
          Przelosuj
        </motion.button>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Wire `restart` into `LocalVersusScreen.tsx` (solo)**

In `src/components/solo/LocalVersusScreen.tsx`, change the destructured hook result (currently lines 16-17) from:

```typescript
  const { pool, deck, poolSize, winner, vote, tieBreak, startTieBreak, resolveTieBreak } =
    useLocalVersus(games.map((g) => g.steamAppId));
```

to:

```typescript
  const { pool, deck, poolSize, winner, vote, tieBreak, startTieBreak, resolveTieBreak, restart } =
    useLocalVersus(games.map((g) => g.steamAppId));
```

Change the winner-screen render (currently line 20) from:

```typescript
  if (winner !== null) {
    return <WinnerScreen game={gameByAppId.get(winner)} />;
  }
```

to:

```typescript
  if (winner !== null) {
    return <WinnerScreen game={gameByAppId.get(winner)} onReroll={restart} />;
  }
```

- [ ] **Step 4: Run the build and tests so far**

Run: `npm run build`
Expected: build succeeds — this checks the solo path end-to-end before moving to the more involved room path.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Add the room-side reroll signal to `rooms.ts`**

In `src/lib/rooms.ts`, add this new section right after the "Rundy eliminacji" section's `finishRound` function (currently ending at line 305, right before the "Rzut monetą" section comment at line 307):

```typescript
/** Sygnał "przelosuj" dla WSZYSTKICH uczestników pokoju -- na TYM SAMYM
 * `session/state` co reszta sygnałów mini-gier, zawsze `{ merge: true }`.
 * Nie tworzy nowej rundy samo z siebie -- każdy klient (w tym ten klikający)
 * subskrybuje to pole w EliminationRound.tsx i reaguje resetując swój lokalny
 * stan `session` do null, co ponownie uruchamia ISTNIEJĄCY mechanizm
 * bootstrapu nowej sesji (ten sam co przy pierwszym wejściu w Versus) oraz
 * ISTNIEJĄCY mechanizm zbiegania do wspólnego sessionId przy wyścigu wielu
 * klientów startujących rundę 1 równolegle -- zero nowej logiki eliminacji,
 * tylko ponowne odpalenie już przetestowanych ścieżek. */
export type RerollSignal = { triggeredAt: Timestamp };

export async function triggerReroll(roomCode: string) {
  await setDoc(
    doc(db, "rooms", roomCode, "session", "state"),
    { reroll: { triggeredAt: serverTimestamp() } },
    { merge: true },
  );
}

export function subscribeToRerollSignal(roomCode: string, onChange: (signal: RerollSignal | null) => void) {
  return onSnapshot(doc(db, "rooms", roomCode, "session", "state"), (snap) => {
    onChange(snap.exists() ? ((snap.data().reroll as RerollSignal | undefined) ?? null) : null);
  });
}
```

- [ ] **Step 6: React to the reroll signal in `EliminationRound.tsx`, gated by a new `allowReroll` prop**

In `src/components/room/EliminationRound.tsx`, add to the imports (currently lines 10-22, the `@/lib/rooms` import block) — add `triggerReroll` and `subscribeToRerollSignal` to the named imports:

```typescript
import {
  subscribeToParticipants,
  getActiveRound,
  startRound,
  subscribeToRound,
  subscribeToRoundSwipes,
  subscribeToEliminationRounds,
  castSwipe,
  finishRound,
  triggerReroll,
  subscribeToRerollSignal,
  type Participant,
  type RoundDoc,
} from "@/lib/rooms";
```

Change the `EliminationRound` function signature (as it stands after Group 1's Task 2 added `backHref` — currently):

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

to:

```typescript
export function EliminationRound({
  roomCode,
  initialPool,
  gameByAppId,
  emptyMessage,
  backHref,
  allowReroll,
}: {
  roomCode: string;
  initialPool: number[];
  gameByAppId: Map<number, SwipeGame>;
  emptyMessage: string;
  backHref?: string;
  allowReroll?: boolean;
}) {
```

Add a new effect right after the existing round-1 sessionId-convergence effect (the one with the comment starting "Naprawa wyścigu: gdy dwóch klientów..."), which currently ends right before the `if (!participantId) { ... }` early-return block:

```typescript
  // Reroll: gdy KTOKOLWIEK w pokoju kliknie "Przelosuj" (WinnerScreen), WSZYSCY
  // klienci (w tym ten klikający -- subskrybują to samo pole) dostają ten sam
  // sygnał i resetują lokalny `session` do null. To ponownie odpala bootstrap
  // (tworzy nową sesję z fresh sessionId, roundNumber 1) i, jeśli kilku klientów
  // trafi na to niemal jednocześnie, ISTNIEJĄCY mechanizm zbiegania rundy 1
  // (efekt wyżej) rozwiąże ewentualny wyścig -- ta sama ścieżka co przy
  // pierwszym wejściu w Versus, nic nowego do przetestowania w elimination.ts.
  // `lastRerollRef`: pierwsza dostawa zaraz po subskrypcji to ZNANY, stary
  // sygnał (Firestore onSnapshot dostarcza aktualny stan dokumentu od razu),
  // nie nowy reroll -- ignorowana, żeby zwykłe ponowne wejście na ekran nie
  // wywoływało fałszywego rerollu.
  const lastRerollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!allowReroll) return;
    return subscribeToRerollSignal(roomCode, (signal) => {
      if (!signal) return;
      const ts = signal.triggeredAt.toMillis();
      if (lastRerollRef.current === null) {
        lastRerollRef.current = ts;
        return;
      }
      if (ts === lastRerollRef.current) return;
      lastRerollRef.current = ts;
      setSession(null);
    });
  }, [roomCode, allowReroll]);
```

Change the `<RoundVoting .../>` call (currently passing `backHref={backHref}`) to also pass `allowReroll`:

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
      allowReroll={allowReroll}
      onAdvance={() => setSession((s) => (s ? { ...s, roundNumber: s.roundNumber + 1 } : s))}
    />
  );
```

Change `RoundVoting`'s prop type and destructure to accept `allowReroll?: boolean` alongside `backHref?: string` (same shape, added the same way `backHref` was added in the earlier Group 1 plan). Change the `WinnerScreen` render inside `RoundVoting` from:

```typescript
  if (round?.status === "finished" && round.survivors?.length === 1) {
    return <WinnerScreen game={gameByAppId.get(round.survivors[0])} />;
  }
```

to:

```typescript
  if (round?.status === "finished" && round.survivors?.length === 1) {
    return (
      <WinnerScreen
        game={gameByAppId.get(round.survivors[0])}
        onReroll={allowReroll ? () => triggerReroll(roomCode) : undefined}
      />
    );
  }
```

- [ ] **Step 7: Opt in from `VersusScreen.tsx`**

In `src/components/room/VersusScreen.tsx`, add `allowReroll` to the `<EliminationRound>` call:

```typescript
  return (
    <EliminationRound
      roomCode={roomCode}
      initialPool={liked.map((g) => g.steamAppId)}
      gameByAppId={gameByAppId}
      emptyMessage="Polub co najmniej 2 gry w Explore, zanim zaczniesz Versus."
      backHref={`/room/${roomCode}`}
      allowReroll
    />
  );
```

Note: `SwipeScreen.tsx` (the manual-pool caller of `EliminationRound`) is intentionally NOT changed — it doesn't pass `allowReroll`, so its `WinnerScreen` gets `onReroll={undefined}` and shows no reroll button, exactly matching its behavior before this task.

- [ ] **Step 8: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS — no `lib/elimination.ts` logic changed (this task deliberately reuses it unmodified), so all its existing tests are unaffected.

- [ ] **Step 10: Manual verification with Playwright**

**Solo:** start the dev server, go through Explore → Polubione → Versus solo with at least 2 liked games, reach a winner. Confirm the "Przelosuj" button appears, and clicking it restarts the bracket from round 1 with the SAME liked games (not a different pool), producing fresh swipes.

**Room (two participants/tabs):** create a room, have both participants like 2+ games, both navigate to Versus, play through to a winner. Confirm:
- (a) The "Przelosuj" button appears on `WinnerScreen` for both participants once a winner is reached.
- (b) Clicking it in tab A causes BOTH tab A and tab B to independently return to "RUNDA 1 · GRA 1 Z N" on the SAME liked pool, within a few seconds (Firestore propagation) — not just the clicking tab.
- (c) Playing this new round through to a (possibly different) winner works normally, including any tie-break if one occurs.
- (d) Separately, verify the manual pool flow (`/room/{code}/swipe`) still shows NO "Przelosuj" button on its `WinnerScreen` (confirms `allowReroll` is correctly NOT set there, no regression).

- [ ] **Step 11: Commit**

```bash
git add src/lib/useLocalVersus.ts src/components/room/WinnerScreen.tsx src/components/solo/LocalVersusScreen.tsx src/lib/rooms.ts src/components/room/EliminationRound.tsx src/components/room/VersusScreen.tsx
git commit -m "feat: add reroll button after Versus result (solo and room, synced for all participants)"
```

---

### Task 3: "Compare libraries" entry point during active Explore (item F)

**Files:**
- Modify: `src/components/room/SharedLibrarySection.tsx`
- Modify: `src/components/room/RoomExploreScreen.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (independent files).
- Produces: `SharedLibrarySection` gains an optional `showEmptyMessage?: boolean` prop (default falsy — `GamePoolScreen.tsx`'s existing call site is unchanged, so its current silent-`null`-for-<2-participants behavior is preserved exactly).

**Scope note (already satisfied by existing code, no new work needed):** the spec's second F requirement — "opcja ustawienia źródła Explore na 'tylko wspólne gry'" — is already fully implemented: `RoomExploreScreen.tsx`'s pre-start screen already has a `SOURCE_OPTIONS` toggle with a `"shared"` value labeled "Wspólna biblioteka", selectable before starting Explore. This task only adds the missing piece: a way to check/act on shared-library overlap **during** an already-started Explore session (regardless of which source you started with), which the spec's own "Gap" note identifies as the actual missing capability.

- [ ] **Step 1: Add the opt-in explicit-empty-message mode to `SharedLibrarySection`**

In `src/components/room/SharedLibrarySection.tsx`, change the function signature (currently lines 7-15) from:

```typescript
export function SharedLibrarySection({
  roomCode,
  participantId,
  participants,
}: {
  roomCode: string;
  participantId: string;
  participants: Participant[];
}) {
```

to:

```typescript
export function SharedLibrarySection({
  roomCode,
  participantId,
  participants,
  showEmptyMessage = false,
}: {
  roomCode: string;
  participantId: string;
  participants: Participant[];
  showEmptyMessage?: boolean;
}) {
```

Change the early-return guard (currently lines 20-21) from:

```typescript
  const withLibrary = participants.filter((p) => (p.steamLibraryAppIds?.length ?? 0) > 0);
  if (withLibrary.length < 2) return null;
```

to:

```typescript
  const withLibrary = participants.filter((p) => (p.steamLibraryAppIds?.length ?? 0) > 0);
  if (withLibrary.length < 2) {
    if (!showEmptyMessage) return null;
    return (
      <p className="text-text-secondary text-center text-xs">
        Za mało uczestników udostępniło bibliotekę Steam, żeby porównać (trzeba podać profil przy dołączaniu do pokoju).
      </p>
    );
  }
```

Note: `GamePoolScreen.tsx`'s existing call site (`<SharedLibrarySection roomCode={roomCode} participantId={participantId} participants={participants} />`) does not pass `showEmptyMessage`, so `showEmptyMessage` defaults to `false` there and its behavior is byte-for-byte unchanged (still silently renders nothing for <2 participants) — do not modify `GamePoolScreen.tsx` in this task.

- [ ] **Step 2: Add a toggle button to surface it during active Explore in `RoomExploreScreen.tsx`**

In `src/components/room/RoomExploreScreen.tsx`, add the import (alongside the existing component imports near the top):

```typescript
import { SharedLibrarySection } from "@/components/room/SharedLibrarySection";
```

Add a new state variable alongside the existing `started`/`currentCard` state declarations (currently around line 54-57):

```typescript
  const [likedCount, setLikedCount] = useState(0);
  const [started, setStarted] = useState(false);
  const [showSharedLibrary, setShowSharedLibrary] = useState(false);
```

Change the active-session header row (currently lines 264-276) from:

```typescript
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

      <TagFilterBar value={genres} onChange={handleGenreChange} />
```

to:

```typescript
      <div className="flex items-center gap-3 pr-12">
        <button
          type="button"
          onClick={() => setStarted(false)}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setShowSharedLibrary((v) => !v)}
          aria-pressed={showSharedLibrary}
          className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground"
        >
          🤝 Porównaj
        </button>
        <Link href={`/room/${roomCode}/liked`} className="bg-secondary rounded-full px-4 py-2 text-xs font-bold text-foreground">
          ❤️ {likedCount}
        </Link>
      </div>

      {showSharedLibrary && participantId && (
        <SharedLibrarySection
          roomCode={roomCode}
          participantId={participantId}
          participants={participants}
          showEmptyMessage
        />
      )}

      <TagFilterBar value={genres} onChange={handleGenreChange} />
```

Note: `participantId` and `participants` are already available in this component's scope (used elsewhere for `useParticipant`/`subscribeToParticipants` and the multiplayer filter) — no new state needed for them.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — `computeSharedLibrary`/`matchesMultiplayerFilter` in `steamLibrary.ts` are unchanged, so `steamLibrary.test.ts` is unaffected.

- [ ] **Step 5: Manual verification with Playwright**

Start the dev server. **≥2-participants-with-library case:** create a room, join with two participants who both provide a Steam profile at join time (or use `RoomUpgradeButton` from a solo session with a library, matching an existing tested flow), start Explore with either source, click "🤝 Porównaj". Confirm the panel shows "Gry, które macie wspólnie (N)" with a working "Dodaj do puli" button (identical to the existing `GamePoolScreen.tsx` behavior). **<2-participants case:** in a fresh room where 0-1 participants provided a library, click "🤝 Porównaj" during Explore and confirm the explicit message now appears (not silence) — then separately visit `/room/{code}/pool` and confirm `GamePoolScreen.tsx`'s shared-library section still renders NOTHING for the same room state (confirms `showEmptyMessage` default there is unaffected, no regression).

- [ ] **Step 6: Commit**

```bash
git add src/components/room/SharedLibrarySection.tsx src/components/room/RoomExploreScreen.tsx
git commit -m "feat: surface library comparison during active Explore, with explicit empty-state message"
```

---

## Self-Review Notes

- **Spec coverage:** C2 (§C2) → Task 1. C3 (§C3) → Task 2. F (§F) → Task 3, with the "shared source" half of F's requirement identified as already satisfied by existing code (documented in Task 3's scope note rather than silently skipped). This closes out the entire 11-point 2026-07-18 UX feedback backlog (Groups 1-4).
- **Placeholder scan:** none found — every step has concrete code.
- **Type consistency:** `VersusStartSignal`/`RerollSignal` both follow the exact same `{ ...; triggeredAt: Timestamp }` shape as the pre-existing `TieBreakState`/`CoinflipState` patterns in the same file. `allowReroll?: boolean` is threaded consistently between `EliminationRound` and `RoundVoting`, matching how `backHref?: string` was threaded in the earlier Group 1 plan (same pattern, same file, proven to work and already merged).
- **Ordering rationale:** Task 1 (C2) and Task 2 (C3) both touch `rooms.ts` but in disjoint, clearly-separated sections (different comment-delimited blocks, no shared function edited by both) — implementing them as separate sequential tasks (not parallel) avoids any merge-order ambiguity in that shared file, per this workflow's "no parallel implementer dispatch" rule.
