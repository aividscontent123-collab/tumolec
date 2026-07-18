# Versus Tie-Breaker (Moneta/Koło) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in button that lets a room (or solo player) resolve a deadlocked final-two-games round via a coin flip or wheel spin, requiring unanimous agreement from all room participants before it can be triggered.

**Architecture:** Extend the existing per-round Firestore document (`rooms/{roomCode}/eliminationRounds/{roundId}`) with a `tieBreak` sub-object tracking agreement + chosen method + result. Reuse the existing `CoinFlip3D`/`WheelCanvas` components (already used by the standalone Coinflip/Wheel tabs) by adapting `tieBreak` into their existing `CoinflipState`/`WheelState` prop shapes — no new animation code. Room and solo get separate thin components (`RoomTieBreaker` / `SoloTieBreaker`), mirroring the codebase's existing `useLocalCoinflip`/`useLocalWheel` vs Firestore-backed pattern.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Firebase Firestore, Framer Motion, Vitest.

## Global Constraints

- Only applies when the current round's pool is exactly 2 games (`round.poolAtStart.length === 2` in room mode, `pool.length === 2` in solo). Mid-bracket ties (>2 games) keep using the existing silent `breakTieDeterministically` — do not touch that path.
- Room trigger requires unanimous agreement from all current `participants` before the coin/wheel choice unlocks. Solo has no agreement step (1 participant = trivially unanimous).
- Once a method is chosen and a result exists, finish the round via the existing `finishRound(roomCode, roundId, [resultAppId])` (room) / `setWinner(resultAppId)` (solo) — do not invent a parallel "winner" code path.
- Follow existing file conventions exactly: Firestore writes for shared minigame state use `setDoc(ref, { field: {...} }, { merge: true })` on a helper (never a raw multi-field `updateDoc`), matching `mergeWheel`/`mergePlinko` in `src/lib/rooms.ts`.

---

### Task 1: Pure random-pick function

**Files:**
- Modify: `src/lib/elimination.ts` (append at end of file)
- Test: `src/lib/elimination.test.ts` (append new `describe` block at end of file)

**Interfaces:**
- Produces: `pickTieBreakWinner(candidates: [number, number]): number` — used by Task 2 (`triggerRoundTieBreak`) and Task 5 (`useLocalVersus`'s local trigger).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/elimination.test.ts` (after the existing `breakTieDeterministically` describe block, still inside the same file — add the import too):

```ts
import { breakTieDeterministically, pickTieBreakWinner, resolveRound, type Swipe } from "./elimination";
```

(replace the existing import line at the top of the file with this one — it's the same import, just adding `pickTieBreakWinner`)

```ts
describe("pickTieBreakWinner", () => {
  it("always returns one of the two candidates", () => {
    const spy = vi.spyOn(Math, "random");

    spy.mockReturnValue(0);
    expect(pickTieBreakWinner([111, 222])).toBe(111);

    spy.mockReturnValue(0.999);
    expect(pickTieBreakWinner([111, 222])).toBe(222);

    spy.mockRestore();
  });
});
```

Add `vi` to the vitest import at the top of the test file:

```ts
import { describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/elimination.test.ts -t pickTieBreakWinner`
Expected: FAIL with `pickTieBreakWinner is not a function` (or a TypeScript "has no exported member" error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/elimination.ts`:

```ts
/** Losuje zwycięzcę spośród dokładnie dwóch remisujących gier -- używane przez
 * ręcznie wyzwalaną minigrę (moneta/koło) w finałowej rundzie Versus/Swipe,
 * gdy grupa utknęła i nie chce dalej głosować. Nie ma związku z automatycznym
 * `breakTieDeterministically` (środek drabinki, cichy, deterministyczny). */
export function pickTieBreakWinner(candidates: [number, number]): number {
  return candidates[Math.floor(Math.random() * 2)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/elimination.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/elimination.ts src/lib/elimination.test.ts
git commit -m "feat: add pickTieBreakWinner for manual final-two tie-break"
```

---

### Task 2: Firestore state + room-side trigger functions

**Files:**
- Modify: `src/lib/rooms.ts`

**Interfaces:**
- Consumes: `pickTieBreakWinner` from Task 1 (`@/lib/elimination`).
- Produces: `TieBreakState` type, `RoundDoc.tieBreak?: TieBreakState`, `toggleTieBreakAgreement(roomCode, roundId, participantId, agreed)`, `triggerRoundTieBreak(roomCode, roundId, method, candidates)` — used by Task 4 (`RoomTieBreaker`).

- [ ] **Step 1: Add the import**

In `src/lib/rooms.ts`, extend the existing import from `@/lib/elimination`:

```ts
import type { SwipeDirection } from "@/lib/elimination";
```

becomes:

```ts
import { pickTieBreakWinner, type SwipeDirection } from "@/lib/elimination";
```

- [ ] **Step 2: Add the type and extend `RoundDoc`**

Add just above the `export type RoundDoc = {` declaration (around line 202):

```ts
/** Stan ręcznie wyzwalanej minigry rozstrzygającej finałową dwójkę (moneta/koło).
 * Żyje na dokumencie rundy (`eliminationRounds/{roundId}`), nie na `session/state`
 * jak coinflip/wheel/plinko -- bo dotyczy KONKRETNEJ rundy, nie całego pokoju.
 * `agreedParticipantIds` musi pokrywać WSZYSTKICH `participants`, zanim `method`
 * może zostać ustawiony (patrz RoomTieBreaker) -- w przeciwieństwie do reszty
 * minigier w apce, ta decyzja kończy całą sesję wyboru gry. */
export type TieBreakState = {
  agreedParticipantIds: string[];
  method: "coin" | "wheel" | null;
  resultAppId: number | null;
  spinning: boolean;
  triggeredAt: Timestamp | null;
};
```

Modify `RoundDoc` to add the new optional field:

```ts
export type RoundDoc = {
  roundNumber: number;
  poolAtStart: number[];
  status: "voting" | "finished";
  survivors: number[] | null;
  sessionId: string;
  tieBreak?: TieBreakState;
};
```

- [ ] **Step 3: Add the merge helper and public functions**

Add after `getActiveRound` (around line 231), before the "Wszystkie rundy pokoju" comment:

```ts
// ── Tie-break finałowej dwójki (moneta/koło) ────────────────────────────────
// Pole `tieBreak` na dokumencie KONKRETNEJ rundy -- zawsze `setDoc({ tieBreak: {...} }, { merge: true })`,
// nigdy zapis całego dokumentu rundy, żeby nie nadpisać `poolAtStart`/`status`/`survivors`.

async function mergeTieBreak(roomCode: string, roundId: string, tieBreak: Record<string, unknown>) {
  await setDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId), { tieBreak }, { merge: true });
}

/** Toggle zgody jednego uczestnika na rozstrzygnięcie losowe. Próg "wszyscy się
 * zgodzili" liczony po stronie UI (RoomTieBreaker) względem aktualnej listy
 * `participants` -- ta funkcja tylko zapisuje/usuwa jeden wpis. */
export async function toggleTieBreakAgreement(
  roomCode: string,
  roundId: string,
  participantId: string,
  agreed: boolean,
) {
  await mergeTieBreak(roomCode, roundId, {
    agreedParticipantIds: agreed ? arrayUnion(participantId) : arrayRemove(participantId),
  });
}

/** Wywoływane dopiero gdy WSZYSCY uczestnicy się zgodzili (sprawdzane przez UI) --
 * losuje zwycięzcę OD RAZU (jak triggerCoinflip/triggerWheelSpin), animacja
 * dogania wynik. Bez guarda przeciw podwójnemu triggerowi -- nieszkodliwe przy
 * wyścigu dwóch klientów, tak samo tolerowane jak w triggerWheelSpin. */
export async function triggerRoundTieBreak(
  roomCode: string,
  roundId: string,
  method: "coin" | "wheel",
  candidates: [number, number],
) {
  const resultAppId = pickTieBreakWinner(candidates);
  await mergeTieBreak(roomCode, roundId, {
    method,
    resultAppId,
    spinning: true,
    triggeredAt: serverTimestamp(),
  });
}
```

- [ ] **Step 4: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors (the file only adds exports/types, doesn't change existing signatures).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rooms.ts
git commit -m "feat: add tieBreak Firestore state and trigger functions to rooms.ts"
```

---

### Task 3: `CoinFlip3D` — custom labels + completion callback

**Files:**
- Modify: `src/components/coinflip/CoinFlip3D.tsx`

**Interfaces:**
- Produces: new optional props `headsLabel?: string`, `tailsLabel?: string`, `onFlipComplete?: () => void` on `CoinFlip3D` — used by Task 4 (`RoomTieBreaker`). Existing callers (`CoinflipScreen.tsx`, `LocalCoinflipPanel.tsx`) pass none of these and are unaffected.

- [ ] **Step 1: Add the new props and wire them in**

Replace the component signature and body in `src/components/coinflip/CoinFlip3D.tsx`:

```tsx
export function CoinFlip3D({
  coinflip,
  headsLabel = "Orzeł",
  tailsLabel = "Reszka",
  onFlipComplete,
}: {
  coinflip: CoinflipState | null;
  headsLabel?: string;
  tailsLabel?: string;
  onFlipComplete?: () => void;
}) {
  const controls = useAnimation();
  const lastTriggerMs = useRef<number | null>(null);

  useEffect(() => {
    if (!coinflip?.spinning || !coinflip.result || !coinflip.triggeredAt) return;
    const triggerMs = coinflip.triggeredAt.toMillis();
    if (lastTriggerMs.current === triggerMs) return;
    lastTriggerMs.current = triggerMs;

    const finalRotation = FULL_SPINS * 360 + (coinflip.result === "tails" ? 180 : 0);
    controls.set({ rotateY: 0 });
    controls
      .start({
        rotateY: finalRotation,
        transition: { duration: FLIP_DURATION_S, ease: [0.16, 1, 0.3, 1] },
      })
      .then(() => onFlipComplete?.());
  }, [coinflip, controls, onFlipComplete]);
```

Then replace the two hardcoded label strings further down in the same file:

```tsx
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full text-lg font-bold text-white"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: "var(--accent-brand)",
            boxShadow: "0 8px 24px var(--accent-brand-soft)",
          }}
        >
          {headsLabel}
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full text-lg font-bold text-white"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            backgroundColor: "oklch(0.3 0.02 265)",
          }}
        >
          {tailsLabel}
        </div>
```

- [ ] **Step 2: Verify existing callers still compile and behave identically**

Run: `npx tsc --noEmit`
Expected: no errors. `CoinflipScreen.tsx` and `LocalCoinflipPanel.tsx` call `<CoinFlip3D coinflip={...} />` with no other props — defaults (`"Orzeł"`/`"Reszka"`, no-op callback) preserve current behavior exactly.

- [ ] **Step 3: Commit**

```bash
git add src/components/coinflip/CoinFlip3D.tsx
git commit -m "feat: make CoinFlip3D labels and completion callback configurable"
```

---

### Task 4: `RoomTieBreaker` component wired into `EliminationRound`

**Files:**
- Create: `src/components/room/RoomTieBreaker.tsx`
- Modify: `src/components/room/EliminationRound.tsx:105-201` (the `RoundVoting` function)

**Interfaces:**
- Consumes: `toggleTieBreakAgreement`, `triggerRoundTieBreak`, `finishRound`, `type Participant`, `type RoundDoc` from `@/lib/rooms` (Task 2); `CoinFlip3D` (Task 3); `WheelCanvas` from `@/components/wheel/WheelCanvas` (unchanged); `type SwipeGame` from `@/lib/types`.
- Produces: `RoomTieBreaker` component, rendered inside `RoundVoting` whenever `round.poolAtStart.length === 2`.

- [ ] **Step 1: Create the component**

Write `src/components/room/RoomTieBreaker.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { CoinFlip3D } from "@/components/coinflip/CoinFlip3D";
import { WheelCanvas } from "@/components/wheel/WheelCanvas";
import {
  finishRound,
  toggleTieBreakAgreement,
  triggerRoundTieBreak,
  type Participant,
  type RoundDoc,
} from "@/lib/rooms";
import type { SwipeGame } from "@/lib/types";

/** Widoczny tylko gdy `round.poolAtStart.length === 2` (wywołane z RoundVoting).
 * Trzy stany: (1) zbieranie zgód wszystkich uczestników, (2) wybór metody po
 * osiągnięciu zgody wszystkich, (3) animacja + odczyt wyniku. */
export function RoomTieBreaker({
  roomCode,
  roundId,
  participantId,
  participants,
  candidates,
  gameByAppId,
  tieBreak,
}: {
  roomCode: string;
  roundId: string;
  participantId: string;
  participants: Participant[];
  candidates: [number, number];
  gameByAppId: Map<number, SwipeGame>;
  tieBreak: RoundDoc["tieBreak"];
}) {
  const agreed = tieBreak?.agreedParticipantIds ?? [];
  const allAgreed =
    participants.length > 0 && participants.every((p) => agreed.includes(p.participantId));
  const iAgreed = agreed.includes(participantId);

  const gameA = gameByAppId.get(candidates[0]);
  const gameB = gameByAppId.get(candidates[1]);

  // Kosmetyczna liczba obrotów koła -- celowo NIE synchronizowana przez Firestore,
  // nie wpływa na to na którym segmencie koło się zatrzyma (patrz spec). Zależność
  // memo MUSI być prymitywem (millis), nie referencją obiektu Timestamp -- Firestore
  // deserializuje nowy obiekt Timestamp przy KAŻDYM snapshocie nawet gdy wartość się
  // nie zmieniła, więc referencja jako zależność przeliczałaby extraTurns (i resetowała
  // animację) przy każdej aktualizacji, nie tylko przy nowym triggerze.
  const triggeredAtMs = tieBreak?.triggeredAt?.toMillis() ?? null;
  const extraTurns = useMemo(() => 4 + Math.floor(Math.random() * 3), [triggeredAtMs]);

  if (!gameA || !gameB) return null;

  function handleResolved() {
    if (!tieBreak?.resultAppId) return;
    finishRound(roomCode, roundId, [tieBreak.resultAppId]);
  }

  if (tieBreak?.method === "coin") {
    return (
      <div className="flex flex-col items-center gap-3 py-3">
        <CoinFlip3D
          coinflip={{ result: tieBreak.resultAppId === candidates[0] ? "heads" : "tails", spinning: tieBreak.spinning, triggeredAt: tieBreak.triggeredAt }}
          headsLabel={gameA.title}
          tailsLabel={gameB.title}
          onFlipComplete={handleResolved}
        />
      </div>
    );
  }

  if (tieBreak?.method === "wheel") {
    return (
      <div className="flex flex-col items-center gap-3 py-3">
        <WheelCanvas
          wheel={{
            entries: [gameA.title, gameB.title],
            winner: tieBreak.resultAppId != null ? gameByAppId.get(tieBreak.resultAppId)?.title ?? null : null,
            spinning: tieBreak.spinning,
            extraTurns,
          }}
          onSpinAnimationComplete={handleResolved}
        />
      </div>
    );
  }

  if (allAgreed) {
    return (
      <div className="flex flex-col items-center gap-2 pb-3">
        <p className="text-text-secondary text-xs">Wszyscy się zgodzili — wybierzcie sposób:</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => triggerRoundTieBreak(roomCode, roundId, "coin", candidates)}
            className="bg-accent-brand rounded-full px-5 py-2 text-sm font-bold text-white"
          >
            Moneta
          </button>
          <button
            type="button"
            onClick={() => triggerRoundTieBreak(roomCode, roundId, "wheel", candidates)}
            className="bg-accent-brand rounded-full px-5 py-2 text-sm font-bold text-white"
          >
            Koło
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 pb-3">
      <p className="text-text-secondary text-xs">
        🎲 {agreed.length}/{participants.length} zgodziło się losować
      </p>
      <button
        type="button"
        onClick={() => toggleTieBreakAgreement(roomCode, roundId, participantId, !iAgreed)}
        className="border-border text-text-secondary rounded-full border px-5 py-2 text-sm"
      >
        {iAgreed ? "Wycofaj zgodę" : "Nie możecie się zdecydować? Zgadzam się losować"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `RoundVoting`**

In `src/components/room/EliminationRound.tsx`, add the import at the top:

```tsx
import { RoomTieBreaker } from "@/components/room/RoomTieBreaker";
```

In the `RoundVoting` function, insert the component right before `<SwipeActionButtons ...>` in the returned JSX (around line 197-198):

```tsx
      </main>
      {round.poolAtStart.length === 2 && (
        <RoomTieBreaker
          roomCode={roomCode}
          roundId={roundId}
          participantId={participantId}
          participants={participants}
          candidates={[round.poolAtStart[0], round.poolAtStart[1]]}
          gameByAppId={gameByAppId}
          tieBreak={round.tieBreak}
        />
      )}
      <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/room/RoomTieBreaker.tsx src/components/room/EliminationRound.tsx
git commit -m "feat: add room tie-breaker (coin/wheel) for final two-game deadlock"
```

---

### Task 5: Solo tie-breaker

**Files:**
- Modify: `src/lib/useLocalVersus.ts`
- Create: `src/components/solo/SoloTieBreaker.tsx`
- Modify: `src/components/solo/LocalVersusScreen.tsx`

**Interfaces:**
- Consumes: `pickTieBreakWinner` from `@/lib/elimination` (Task 1); `CoinFlip3D` (Task 3); `WheelCanvas` (unchanged).
- Produces: `useLocalVersus` now also returns `pool: number[]`, `tieBreak: { method: "coin" | "wheel"; resultAppId: number } | null`, `startTieBreak(method: "coin" | "wheel"): void`.

- [ ] **Step 1: Extend `useLocalVersus`**

Replace the full contents of `src/lib/useLocalVersus.ts`:

```ts
"use client";

import { useState } from "react";
import {
  breakTieDeterministically,
  pickTieBreakWinner,
  resolveRound,
  type Swipe,
  type SwipeDirection,
} from "@/lib/elimination";

const SOLO_PARTICIPANT = "solo";

// `triggeredAt`/`extraTurns` generowane RAZ w startTieBreak() i trzymane w stanie --
// nie fabrykować ich w komponencie przy każdym renderze (Date.now()/Math.random()
// inline w JSX dawałyby nową wartość co render i resetowały animację CoinFlip3D/WheelCanvas,
// które oczekują stabilnej wartości identyfikującej POJEDYNCZY trigger).
type LocalTieBreak = {
  method: "coin" | "wheel";
  resultAppId: number;
  triggeredAt: { toMillis: () => number };
  extraTurns: number;
};

/** Wersja lokalna orkiestracji rund eliminacji z SwipeScreen.tsx/RoundVoting --
 * ten sam resolveRound, bez Firestore, bez wielu uczestników (jeden głos na
 * grę na rundę). Wzorem useLocalCoinflip/useLocalWheel z Fazy A2b. */
export function useLocalVersus(initialPool: number[]) {
  const [pool, setPool] = useState(initialPool);
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const [winner, setWinner] = useState<number | null>(null);
  const [tieBreak, setTieBreak] = useState<LocalTieBreak | null>(null);

  function vote(steamAppId: number, direction: SwipeDirection) {
    const nextSwipes = [...swipes, { participantId: SOLO_PARTICIPANT, steamAppId, direction }];
    setSwipes(nextSwipes);

    const voted = new Set(nextSwipes.map((s) => s.steamAppId));
    if (!pool.every((id) => voted.has(id))) return;

    const result = resolveRound(pool, nextSwipes);
    if (result.status === "winner") {
      setWinner(result.steamAppId);
    } else if (result.status === "advance") {
      setPool(result.survivors);
      setSwipes([]);
    } else if (result.status === "tie-break") {
      const brokenTie = breakTieDeterministically(result.tiedForCutoff, result.slotsAvailable);
      setPool([...result.survivors, ...brokenTie]);
      setSwipes([]);
    }
  }

  // Ręczna minigra (moneta/koło) -- wyłącznie gdy w puli zostały dokładnie 2 gry.
  // Solo = zgoda trywialna (1 uczestnik), więc brak etapu zbierania zgód jak w pokoju.
  function startTieBreak(method: "coin" | "wheel") {
    if (pool.length !== 2) return;
    setTieBreak({
      method,
      resultAppId: pickTieBreakWinner([pool[0], pool[1]]),
      triggeredAt: { toMillis: () => Date.now() },
      extraTurns: 4 + Math.floor(Math.random() * 3),
    });
  }

  function resolveTieBreak() {
    if (tieBreak) setWinner(tieBreak.resultAppId);
  }

  const myVotes = new Set(swipes.map((s) => s.steamAppId));
  const deck = pool.filter((id) => !myVotes.has(id));

  return { pool, deck, poolSize: pool.length, winner, vote, tieBreak, startTieBreak, resolveTieBreak };
}
```

- [ ] **Step 2: Create `SoloTieBreaker`**

Write `src/components/solo/SoloTieBreaker.tsx`:

```tsx
"use client";

import { CoinFlip3D } from "@/components/coinflip/CoinFlip3D";
import { WheelCanvas } from "@/components/wheel/WheelCanvas";
import type { SwipeGame } from "@/lib/types";

/** Wersja solo RoomTieBreaker -- bez etapu zgód (1 uczestnik = zgoda trywialna),
 * bez Firestore. Widoczny wyłącznie gdy w puli zostały dokładnie 2 gry. */
export function SoloTieBreaker({
  candidates,
  gameByAppId,
  tieBreak,
  onChooseMethod,
  onResolved,
}: {
  candidates: [number, number];
  gameByAppId: Map<number, SwipeGame>;
  tieBreak: {
    method: "coin" | "wheel";
    resultAppId: number;
    triggeredAt: { toMillis: () => number };
    extraTurns: number;
  } | null;
  onChooseMethod: (method: "coin" | "wheel") => void;
  onResolved: () => void;
}) {
  const gameA = gameByAppId.get(candidates[0]);
  const gameB = gameByAppId.get(candidates[1]);
  if (!gameA || !gameB) return null;

  if (tieBreak?.method === "coin") {
    return (
      <div className="flex flex-col items-center gap-3 py-3">
        <CoinFlip3D
          coinflip={{
            result: tieBreak.resultAppId === candidates[0] ? "heads" : "tails",
            spinning: true,
            triggeredAt: tieBreak.triggeredAt,
          }}
          headsLabel={gameA.title}
          tailsLabel={gameB.title}
          onFlipComplete={onResolved}
        />
      </div>
    );
  }

  if (tieBreak?.method === "wheel") {
    return (
      <div className="flex flex-col items-center gap-3 py-3">
        <WheelCanvas
          wheel={{
            entries: [gameA.title, gameB.title],
            winner: gameByAppId.get(tieBreak.resultAppId)?.title ?? null,
            spinning: true,
            extraTurns: tieBreak.extraTurns,
          }}
          onSpinAnimationComplete={onResolved}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 pb-3">
      <p className="text-text-secondary text-xs">Nie możecie się zdecydować?</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onChooseMethod("coin")}
          className="bg-accent-brand rounded-full px-5 py-2 text-sm font-bold text-white"
        >
          Moneta
        </button>
        <button
          type="button"
          onClick={() => onChooseMethod("wheel")}
          className="bg-accent-brand rounded-full px-5 py-2 text-sm font-bold text-white"
        >
          Koło
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into `LocalVersusScreen`**

Replace the full contents of `src/components/solo/LocalVersusScreen.tsx`:

```tsx
"use client";

import { useLocalVersus } from "@/lib/useLocalVersus";
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
  const { pool, deck, poolSize, winner, vote, tieBreak, startTieBreak, resolveTieBreak } =
    useLocalVersus(games.map((g) => g.steamAppId));

  if (winner !== null) {
    return <WinnerScreen game={gameByAppId.get(winner)} />;
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
          <SwipeCard key={currentGame.steamAppId} game={currentGame} onSwipe={handleSwipe} />
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
      <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test`
Expected: all tests pass (existing suite + Task 1's new test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/useLocalVersus.ts src/components/solo/SoloTieBreaker.tsx src/components/solo/LocalVersusScreen.tsx
git commit -m "feat: add solo tie-breaker (coin/wheel) for final two-game deadlock"
```

---

### Task 6: Manual verification (Playwright)

No code changes — this task confirms the feature actually works end-to-end, per this project's convention of verifying Firestore/UI flows manually rather than with automated UI tests.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background)

- [ ] **Step 2: Verify solo flow**

Using Playwright (or manually in a browser): open a solo session, like exactly 2 games in Explore, enter Versus, get to the final round. Confirm:
- The "Nie możecie się zdecydować?" prompt with "Moneta"/"Koło" buttons appears.
- Clicking "Moneta" shows the coin animation with the two actual game titles on its faces, and after it settles, the `WinnerScreen` shows the correct winning game (matching whichever face landed).
- Repeat once for "Koło" — the wheel shows both game titles as its two segments, spins, and settles into `WinnerScreen` with the matching game.

- [ ] **Step 3: Verify room flow with 2 simulated participants**

Open two browser contexts joined to the same room code. Get both to the final round of Versus (or Swipe) with 2 games left.
- Confirm the agreement banner shows "0/2" then "1/2" after one participant clicks "Zgadzam się losować", and that clicking "Wycofaj zgodę" decrements it back.
- After both participants agree, confirm the "Moneta"/"Koło" choice appears on BOTH screens.
- Click one method on one browser context; confirm the OTHER context's screen also transitions into the same animation with the same result and lands on the same `WinnerScreen`.

- [ ] **Step 4: Report result**

If any step fails, note the exact console/Firestore error and fix before considering this plan complete. If all steps pass, this plan is done — no commit needed for this task (verification only).

---

## Self-Review Notes

- **Spec coverage:** Task 1 = `pickTieBreakWinner`. Task 2 = `TieBreakState`/`RoundDoc`/Firestore functions. Task 3 = `CoinFlip3D` label/callback support. Task 4 = room UI + wiring (all 3 render states from the spec: agreement banner, method choice, animation). Task 5 = solo UI + wiring. Task 6 = manual verification (spec's stated test strategy). All spec sections covered.
- **Placeholder scan:** none found — every step has complete code.
- **Type consistency:** `TieBreakState`/`RoundDoc.tieBreak` (Task 2) → consumed identically in `RoomTieBreaker` (Task 4) via `round.tieBreak` prop. `pickTieBreakWinner([number, number]): number` (Task 1) → same signature used in Task 2's `triggerRoundTieBreak` and Task 5's `startTieBreak`. Local solo tie-break shape `{ method, resultAppId, triggeredAt, extraTurns }` used consistently between `useLocalVersus` (Task 5) and `SoloTieBreaker` props.
- **Bug caught in review (fixed inline):** initial draft fabricated `triggeredAt`/`extraTurns` inline at render time (solo: `Date.now()`/`Math.random()` directly in JSX; room: `useMemo` keyed on the Firestore `Timestamp` object reference, which changes every snapshot even when the value doesn't). Both would have restarted the coin/wheel animation on every unrelated re-render. Fixed by storing both in state once per trigger (solo) and keying the room's `useMemo` on the primitive `.toMillis()` value instead of the object reference.
