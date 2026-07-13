# Faza A2b — Mini-gry pod pływającym przyciskiem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Zależność:** Wykonaj PO `2026-07-13-tumolec-solo-coop-upgrade-plan-a2a.md` (oba plany dotykają `RoomLobby.tsx` i `SoloSwipeScreen.tsx` — sekwencyjnie, żeby uniknąć konfliktów mergów przy równoległych worktree'ach).

**Goal:** Koło fortuny i Rzut monetą przestają być osobnymi pozycjami nawigacji pokoju — trafiają pod jeden pływający przycisk (hub), dostępny też w trybie solo z lokalną (bez Firestore) wersją obu mini-gier.

**Architecture:** Nowy współdzielony komponent `MiniGameLauncher` (pływający przycisk + wysuwany panel) z dwoma trybami: `room` (linkuje do istniejących tras `/room/[code]/coinflip|wheel|plinko`, zero zmian w tych trasach) i `solo` (renderuje lokalne panele oparte o nowe hooki `useLocalCoinflip`/`useLocalWheel`, reużywające istniejące czysto prezentacyjne komponenty `CoinFlip3D`/`WheelCanvas`).

**Tech Stack:** Next.js 16 (App Router) + TypeScript, React state (bez Firestore w trybie solo).

## Global Constraints

- Zero zmian w trasach `/room/[code]/coinflip|wheel|plinko` ani w `src/lib/rooms.ts` Firestore-owych funkcjach mini-gier (`triggerCoinflip`, `triggerWheelSpin` itd.) — tryb pokoju działa 1:1 jak dziś.
- `CoinFlip3D` i `WheelCanvas` (czysto prezentacyjne, sterowane propsami) używane BEZ ZMIAN logiki wewnętrznej — tylko rozszerzenie typu `triggeredAt` na strukturalny interfejs zamiast twardego Firestore `Timestamp`.
- Po każdym zadaniu: `npm run build` bez błędów typów.
- Styl UI: kontynuować istniejące klasy/tokeny (`bg-card`, `bg-secondary`, `bg-accent-brand`, `text-text-secondary`).
- Kod polski (etykiety, komunikaty).

## Poza zakresem (świadomie, wymaga decyzji produktowej przed podjęciem)

**Lokalne Plinko nie wchodzi w zakres tego planu.** W trybie pokoju Plinko losuje spośród `PoolGame[]` (gry Steam z okładkami, `lib/rooms.ts` `PoolGame` type) — w trybie solo nie ma odpowiednika trwałej puli pokoju, tylko efemeryczna talia swipe'a (`SteamOwnedGame[]`, appid+playtime, bez okładek). Zanim zaimplementować lokalne Plinko, potrzebna jest decyzja: czy losuje spośród aktualnej talii swipe'a (wymaga dociągnięcia okładek przez `/api/steam/details`, jak w Task 4 planu A2a), spośród już poswipe'owanych "zagram" kandydatów, czy w ogóle nie ma sensu w trybie solo (skoro solo to jedna osoba, "losowanie między grami" mniej naturalne niż w grupie). W trybie pokoju Plinko zostaje dostępne przez hub bez zmian (link do istniejącej trasy).

---

## Kontekst dla implementującego

Repo: `C:\Users\miros\tumolec`. Pliki źródłowe do przeczytania przed startem:
- `src/components/coinflip/CoinFlip3D.tsx` — czysto prezentacyjny komponent monety (props: `coinflip: CoinflipState | null`)
- `src/components/wheel/WheelCanvas.tsx` — czysto prezentacyjny komponent koła (props: `wheel: WheelState`, `onSpinAnimationComplete: () => void`)
- `src/lib/rooms.ts` — typy `CoinflipState`, `WheelState` i Firestore-owe `triggerCoinflip`/`triggerWheelSpin`/`subscribeToCoinflip`/`subscribeToWheel` (WZÓR logiki losowania do skopiowania lokalnie, NIE importować bezpośrednio żeby nie ciągnąć zależności od Firestore w trybie solo)
- `src/components/room/RoomLobby.tsx:158-177` — obecne 3 linki do mini-gier w lobby (do usunięcia)
- `src/components/solo/SoloSwipeScreen.tsx` — ekran solo, gdzie dopina się launcher

---

## Task 1: `TimestampLike` — odczep `CoinflipState` od twardego Firestore `Timestamp`

**Kontekst:** `CoinFlip3D` woła `coinflip.triggeredAt.toMillis()` żeby wykryć NOWY rzut. W trybie solo nie ma `serverTimestamp()` z Firestore — potrzebny strukturalny typ z samą metodą `toMillis()`, którą prawdziwy Firestore `Timestamp` i tak spełnia (zero zmian w trybie pokoju).

**Files:**
- Modify: `src/lib/rooms.ts:250-254` (typ `CoinflipState`)

**Interfaces:**
- Produces: `export type TimestampLike = { toMillis(): number };` i `CoinflipState.triggeredAt: TimestampLike | null`

- [ ] **Step 1: Dodaj typ i zmień pole**

W `src/lib/rooms.ts`, tuż przed `export type CoinflipState = {...}` (linia 250), dodaj:

```typescript
/** Strukturalny podzbiór Firestore Timestamp -- pozwala trybowi solo (bez
 * Firestore) budować kompatybilny obiekt `{ toMillis: () => Date.now() }`
 * zamiast prawdziwego serverTimestamp(). */
export type TimestampLike = { toMillis(): number };
```

Zmień pole w `CoinflipState` (linia 253) z `triggeredAt: Timestamp | null;` na `triggeredAt: TimestampLike | null;`.

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów (Firestore `Timestamp` strukturalnie spełnia `TimestampLike`, więc `subscribeToCoinflip`/`triggerCoinflip` kompilują się bez zmian).

- [ ] **Step 3: Commit**

```bash
git add src/lib/rooms.ts
git commit -m "refactor: CoinflipState.triggeredAt jako TimestampLike (odczep od Firestore Timestamp)"
```

---

## Task 2: `useLocalCoinflip` + `LocalCoinflipPanel`

**Files:**
- Create: `src/lib/useLocalMiniGames.ts`
- Create: `src/components/minigames/LocalCoinflipPanel.tsx`

**Interfaces:**
- Consumes: `CoinflipState` (z `@/lib/rooms`), `CoinFlip3D` (z `@/components/coinflip/CoinFlip3D`)
- Produces: `useLocalCoinflip(): { coinflip: CoinflipState; flip: () => void }`

- [ ] **Step 1: Stwórz `src/lib/useLocalMiniGames.ts`**

```typescript
"use client";

import { useState } from "react";
import type { CoinflipState, WheelState } from "@/lib/rooms";

const FLIP_DURATION_MS = 2200;

/** Wersja lokalna triggerCoinflip (rooms.ts) -- ten sam algorytm losowania,
 * bez zapisu do Firestore. Jeden uczestnik (tryb solo) nie potrzebuje
 * synchronizacji między klientami. */
export function useLocalCoinflip() {
  const [coinflip, setCoinflip] = useState<CoinflipState>({
    result: null,
    spinning: false,
    triggeredAt: null,
  });

  function flip() {
    const result: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
    setCoinflip({ result, spinning: true, triggeredAt: { toMillis: () => Date.now() } });
    setTimeout(() => setCoinflip((s) => ({ ...s, spinning: false })), FLIP_DURATION_MS);
  }

  return { coinflip, flip };
}

/** Wersja lokalna addWheelEntry/removeWheelEntry/triggerWheelSpin (rooms.ts). */
export function useLocalWheel() {
  const [wheel, setWheel] = useState<WheelState>({
    entries: [],
    spinning: false,
    winner: null,
    extraTurns: null,
  });

  function addEntry(entry: string) {
    if (!entry || wheel.entries.includes(entry)) return;
    setWheel((w) => ({ ...w, entries: [...w.entries, entry] }));
  }

  function removeEntry(entry: string) {
    setWheel((w) => ({ ...w, entries: w.entries.filter((e) => e !== entry) }));
  }

  function spin() {
    if (wheel.entries.length === 0) return;
    const winner = wheel.entries[Math.floor(Math.random() * wheel.entries.length)];
    const extraTurns = 4 + Math.floor(Math.random() * 3);
    setWheel((w) => ({ ...w, winner, extraTurns, spinning: true }));
  }

  function finishSpin() {
    setWheel((w) => ({ ...w, spinning: false }));
  }

  return { wheel, addEntry, removeEntry, spin, finishSpin };
}
```

- [ ] **Step 2: Stwórz `src/components/minigames/LocalCoinflipPanel.tsx`**

```tsx
"use client";

import { CoinFlip3D } from "@/components/coinflip/CoinFlip3D";
import { useLocalCoinflip } from "@/lib/useLocalMiniGames";

export function LocalCoinflipPanel() {
  const { coinflip, flip } = useLocalCoinflip();
  const resultLabel =
    coinflip.result === "heads" ? "Orzeł" : coinflip.result === "tails" ? "Reszka" : null;

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <CoinFlip3D coinflip={coinflip} />
      <p className="text-text-secondary text-sm">
        {resultLabel ? `Wynik: ${resultLabel}` : "Naciśnij, żeby rzucić"}
      </p>
      <button
        type="button"
        onClick={flip}
        disabled={coinflip.spinning}
        className="bg-accent-brand w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
      >
        {coinflip.spinning ? "Rzucam…" : "Rzuć monetą"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów.

- [ ] **Step 4: Commit**

```bash
git add src/lib/useLocalMiniGames.ts src/components/minigames/LocalCoinflipPanel.tsx
git commit -m "feat: rzut moneta w trybie solo (lokalny stan, bez Firestore)"
```

---

## Task 3: `LocalWheelPanel`

**Files:**
- Create: `src/components/minigames/LocalWheelPanel.tsx`

**Interfaces:**
- Consumes: `useLocalWheel` (z Task 2), `WheelCanvas` (z `@/components/wheel/WheelCanvas`)

- [ ] **Step 1: Stwórz `src/components/minigames/LocalWheelPanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import { WheelCanvas } from "@/components/wheel/WheelCanvas";
import { useLocalWheel } from "@/lib/useLocalMiniGames";

export function LocalWheelPanel() {
  const { wheel, addEntry, removeEntry, spin, finishSpin } = useLocalWheel();
  const [value, setValue] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const entry = value.trim();
    if (!entry) return;
    setValue("");
    addEntry(entry);
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <WheelCanvas wheel={wheel} onSpinAnimationComplete={finishSpin} />

      {wheel.winner && !wheel.spinning && (
        <p className="text-center text-sm text-foreground">
          Wygrywa: <span className="font-bold">{wheel.winner}</span>
        </p>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Dodaj do koła…"
          maxLength={40}
          className="bg-card border-border flex-1 rounded-xl border px-4 py-3 text-sm text-foreground"
        />
        <button type="submit" className="bg-accent-brand rounded-xl px-4 text-sm font-bold text-white">
          Dodaj
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {wheel.entries.map((entry) => (
          <li
            key={entry}
            className="bg-card flex items-center justify-between rounded-xl px-5 py-3.5 text-base text-foreground"
          >
            {entry}
            <button
              type="button"
              aria-label={`Usuń ${entry}`}
              onClick={() => removeEntry(entry)}
              className="text-text-secondary flex h-8 w-8 items-center justify-center text-lg"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={wheel.entries.length < 2 || wheel.spinning}
        onClick={spin}
        className="bg-accent-brand rounded-full py-4 text-base font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
      >
        {wheel.spinning ? "Kręcimy…" : wheel.entries.length < 2 ? "Dodaj co najmniej 2 wpisy" : "Losuj"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów.

- [ ] **Step 3: Commit**

```bash
git add src/components/minigames/LocalWheelPanel.tsx
git commit -m "feat: kolo fortuny w trybie solo (lokalny stan, bez Firestore)"
```

---

## Task 4: `MiniGameLauncher` — pływający przycisk + hub

**Files:**
- Create: `src/components/minigames/MiniGameLauncher.tsx`

**Interfaces:**
- Consumes: `LocalCoinflipPanel`, `LocalWheelPanel` (Task 2, 3)
- Produces: `MiniGameLauncher({ mode }: { mode: { kind: "room"; roomCode: string } | { kind: "solo" } })`

- [ ] **Step 1: Stwórz `src/components/minigames/MiniGameLauncher.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { LocalCoinflipPanel } from "@/components/minigames/LocalCoinflipPanel";
import { LocalWheelPanel } from "@/components/minigames/LocalWheelPanel";

type Mode = { kind: "room"; roomCode: string } | { kind: "solo" };
type Panel = "coinflip" | "wheel" | null;

/** Pływający przycisk otwierający hub mini-gier. Tryb "room": linkuje do
 * istniejących tras pokoju (zero nowej logiki, tylko relokacja punktu
 * wejścia z 3 przycisków lobby na 1 przycisk + hub). Tryb "solo": renderuje
 * lokalne panele (bez Firestore, bez pokoju) bezpośrednio w hubie. */
export function MiniGameLauncher({ mode }: { mode: Mode }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  function close() {
    setOpen(false);
    setPanel(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mini-gry"
        className="bg-accent-brand fixed right-4 bottom-6 z-20 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
      >
        🎲
      </button>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={close}>
          <div className="bg-background w-full rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold text-foreground">Mini-gry</h2>
              <button type="button" onClick={close} aria-label="Zamknij" className="text-text-secondary text-2xl">
                ✕
              </button>
            </div>

            {panel === "coinflip" ? (
              <LocalCoinflipPanel />
            ) : panel === "wheel" ? (
              <LocalWheelPanel />
            ) : mode.kind === "solo" ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setPanel("coinflip")}
                  className="bg-secondary rounded-full py-3 text-sm font-bold text-foreground"
                >
                  Rzut monetą
                </button>
                <button
                  type="button"
                  onClick={() => setPanel("wheel")}
                  className="bg-secondary rounded-full py-3 text-sm font-bold text-foreground"
                >
                  Koło fortuny
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Link
                  href={`/room/${mode.roomCode}/coinflip`}
                  className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
                >
                  Rzut monetą
                </Link>
                <Link
                  href={`/room/${mode.roomCode}/wheel`}
                  className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
                >
                  Koło fortuny
                </Link>
                <Link
                  href={`/room/${mode.roomCode}/plinko`}
                  className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
                >
                  Plinko
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów.

- [ ] **Step 3: Commit**

```bash
git add src/components/minigames/MiniGameLauncher.tsx
git commit -m "feat: MiniGameLauncher - plywajacy przycisk + hub mini-gier"
```

---

## Task 5: Podłącz w `RoomLobby.tsx` (tryb pokoju)

**Files:**
- Modify: `src/components/room/RoomLobby.tsx:158-177` (usuń bezpośrednie linki), `:109` lub w miejscu głównego `<main>` (dodaj launcher)

- [ ] **Step 1: Usuń 3 bezpośrednie linki**

Usuń blok (linie 158-177):

```tsx
<div className="flex gap-3">
  <Link href={`/room/${roomCode}/coinflip`} ...>Rzut monetą</Link>
  <Link href={`/room/${roomCode}/wheel`} ...>Koło fortuny</Link>
</div>
<Link href={`/room/${roomCode}/plinko`} ...>Plinko</Link>
```

(zostają "Pula gier →" i "Historia".)

- [ ] **Step 2: Dodaj import i launcher**

Dodaj import: `import { MiniGameLauncher } from "@/components/minigames/MiniGameLauncher";`

Wewnątrz głównego `return (<main ...>` bloku po dołączeniu (ten sam poziom co reszta lobby, np. tuż przed zamykającym `</main>`), dodaj:

```tsx
<MiniGameLauncher mode={{ kind: "room", roomCode }} />
```

- [ ] **Step 3: Zweryfikuj build i ręcznie**

Run: `npm run build`
Expected: bez błędów.

Ręcznie: otwórz `/room/{code}`, potwierdź że pływający przycisk 🎲 otwiera hub z 3 linkami prowadzącymi do tych samych tras co wcześniej (Rzut monetą/Koło/Plinko działają identycznie jak przed zmianą).

- [ ] **Step 4: Commit**

```bash
git add src/components/room/RoomLobby.tsx
git commit -m "feat: mini-gry pokoju pod plywajacym przyciskiem zamiast osobnych linkow w lobby"
```

---

## Task 6: Podłącz w `SoloSwipeScreen.tsx` (tryb solo)

**Files:**
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

- [ ] **Step 1: Dodaj import i launcher**

Dodaj import: `import { MiniGameLauncher } from "@/components/minigames/MiniGameLauncher";`

W głównym `return (<main ...>` bloku, tuż przed zamykającym `</main>`, dodaj:

```tsx
<MiniGameLauncher mode={{ kind: "solo" }} />
```

- [ ] **Step 2: Zweryfikuj build i ręcznie**

Run: `npm run build`
Expected: bez błędów.

Ręcznie: wczytaj bibliotekę solo, potwierdź że pływający przycisk otwiera hub z "Rzut monetą" i "Koło fortuny", oba działają lokalnie (bez błędów w konsoli, bez zapisów do Firestore — sprawdzić w zakładce Network że brak requestów do `firestore.googleapis.com` po kliknięciu).

- [ ] **Step 3: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: mini-gry (rzut moneta, kolo) dostepne w trybie solo przez plywajacy przycisk"
```

---

## Task 7: Pełna ręczna weryfikacja

- [ ] **Step 1: Tryb solo**

`npm run dev` → `/` → wczytaj bibliotekę → na ekranie swipe kliknij 🎲 → przetestuj Rzut monetą (kilka rzutów) i Koło fortuny (dodaj 3 wpisy, usuń jeden, zakręć).

- [ ] **Step 2: Tryb pokoju**

Stwórz pokój (Task 6 planu A2a) → w lobby kliknij 🎲 → potwierdź że linki prowadzą do działających tras `/coinflip`, `/wheel`, `/plinko` (dokładnie jak przed zmianą, teraz tylko przez hub zamiast bezpośrednich przycisków w lobby).

- [ ] **Step 3: `npm run build && npx vitest run`**

Expected: build bez błędów, wszystkie istniejące testy nadal zielone (ten plan nie dotyka logiki testowanej w `*.test.ts`).

## Self-Review Checklist

1. **Pokrycie spec sekcji 6**: pływający przycisk (Task 4), tryb solo lokalny dla Coinflip+Wheel (Task 2, 3), tryb pokoju bez zmian w logice, tylko relokacja wejścia (Task 5). Plinko solo świadomie odłożone (patrz "Poza zakresem") — wymaga decyzji produktowej o źródle gier, nie technicznej.
2. **Brak placeholderów**: pełny kod w każdym kroku.
3. **Spójność typów**: `TimestampLike` z Task 1 użyty w `useLocalCoinflip` (Task 2); `Mode` union z Task 4 użyty identycznie w Task 5 (`{ kind: "room", roomCode }`) i Task 6 (`{ kind: "solo" }`).
