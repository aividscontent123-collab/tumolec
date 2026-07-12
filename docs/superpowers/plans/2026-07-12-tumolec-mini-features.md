# Tumolec — pięć drobnych funkcji: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać pięć niezależnych drobnych funkcji do PWA Tumolec (QR pokoju, natywny share, naprawa sesji eliminacji + rozszerzona historia, paczki gier, mini-gra Plinko).

**Architecture:** Każda funkcja jest samodzielna i budowana na osobnym branchu feature. Czysta logika (matematyka slotów Plinko, grupowanie rund po sesji, diff paczki vs pula) żyje w `src/lib/*.ts` z kolokowanymi testami Vitest, oddzielona od warstwy Firestore (`src/lib/rooms.ts`) i UI (`src/components/**`). Nowe mini-gry i stan współdzielony synchronizują się przez wzorzec „merge tylko własnego pola" w dokumencie `rooms/{code}/session/state`.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion, Firebase Firestore (`tumolec-d67d9`, plan Spark). Nowe zależności: `qrcode` (+ `@types/qrcode`) dla Feature 1, `matter-js` (+ `@types/matter-js`) dla Feature 5. Vitest do TDD czystej logiki.

## Global Constraints

Te reguły obowiązują w KAŻDYM zadaniu, niezależnie od grupy funkcji:

- **To NIE jest znany ci Next.js.** Przed pisaniem jakiegokolwiek kodu Next przeczytaj odpowiedni przewodnik w `node_modules/next/dist/docs/` (patrz `AGENTS.md` w root). API/konwencje mogą różnić się od twoich danych treningowych.
- **Nigdy nie commituj na `master`.** `master` auto-deployuje się na produkcję (`tumolec.vercel.app`) przy każdym pushu. Pracuj na branchu feature podanym w nagłówku grupy.
- **Git na tej maszynie (Windows) może nie być na PATH basha.** Jeśli bash zgłosi `git: command not found`, uruchamiaj polecenia git przez PowerShell.
- **BEZ trailera `Co-Authored-By`** w commitach (zgodnie z `CLAUDE.md` projektu — `attribution.commit` nie jest ustawione). Zignoruj domyślną sugestię narzędzia Bash.
- **Alias importu:** `@/` → `src/` (zdefiniowany w `tsconfig.json` i `vitest.config.ts`).
- **Testy:** kolokowane `*.test.ts` obok testowanego pliku, `describe`/`it` z Vitest, środowisko `node`. Uruchamianie: `npx vitest run`.
- **Copy UI po polsku.** Etykiety przycisków, komunikaty i teksty commitów po polsku (spójnie z resztą repo).
- **Wzorzec `session/state`:** każdy zapis do `rooms/{code}/session/state` MUSI używać `setDoc(ref, { <pole>: {...} }, { merge: true })` na własnym zagnieżdżonym polu (`coinflip`/`wheel`/`plinko`) — NIGDY `setDoc` całego dokumentu, żeby nie nadpisać sąsiednich pól innych mini-gier. Zob. komentarze przy `mergeWheel`/`triggerCoinflip` w `src/lib/rooms.ts`.
- **Bar weryfikacji na koniec każdej grupy:** `npm run build` (musi przejść) + `npx vitest run` (wszystkie testy zielone). Wizualna weryfikacja przez Playwright MCP jest opcjonalnym „nice-to-have", jeśli dostępna — nie zakładaj, że jest.

### Pliki dotykane przez wiele grup (uwaga na konflikty przy merge)

Grupy będą mergowane osobno. Te pliki są dotykane przez więcej niż jedną grupę — mergujący powinien rebase'ować ostrożnie:

- `src/components/room/RoomLobby.tsx` — Feature 1 (QR), Feature 2 (share), Feature 5 (link do Plinko).
- `src/lib/rooms.ts` — Feature 3 (sesje/historia), Feature 4 (paczki), Feature 5 (Plinko).
- `firestore.rules` — Feature 3 (`eliminationRounds`), Feature 4 (`packages`).

Każda grupa dodaje ROZŁĄCZNE fragmenty (osobne funkcje / osobne bloki `match`), więc konflikty są mechaniczne (sąsiadujące wstawki), nie logiczne.

---

## Feature 1: QR kod pokoju (branch `feat/qr-kod`)

**Cel:** telefon-do-telefonu dołączanie do pokoju bez przepisywania linku. Czysto kliencka generacja QR, zero backendu, zero zmian danych/`firestore.rules`.

### Task 1.1: Dodanie zależności `qrcode` i wyświetlenie QR w lobby

**Files:**
- Modify: `package.json` (nowa zależność)
- Modify: `src/components/room/RoomLobby.tsx`

**Interfaces:**
- Consumes: `RoomLobby({ roomCode }: { roomCode: string })` — istniejący komponent kliencki, sekcja „dołączonego" widoku pokazuje `KOD POKOJU: {roomCode}` (linie ~78-103).
- Produces: nic dla innych zadań (samodzielna zmiana UI).

- [ ] **Step 1: Utwórz branch**

```bash
git checkout master && git pull && git checkout -b feat/qr-kod
```

- [ ] **Step 2: Zainstaluj `qrcode` + typy**

Run: `npm install qrcode && npm install -D @types/qrcode`
Expected: `package.json` dostaje `"qrcode"` w `dependencies` i `"@types/qrcode"` w `devDependencies`.

- [ ] **Step 3: Wygeneruj i pokaż kod QR w RoomLobby**

W `src/components/room/RoomLobby.tsx` dodaj import na górze (obok istniejących importów):

```tsx
import QRCode from "qrcode";
```

Dodaj stan i efekt generujący data-URL wewnątrz komponentu `RoomLobby`, zaraz po istniejących `useState` (po linii `const [joining, setJoining] = useState(false);`):

```tsx
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    // Kod QR celowo koduje publiczny URL produkcyjny (nie window.location.origin) --
    // skanuje go inny telefon, który nie dosięgnie localhosta ani preview-URL.
    QRCode.toDataURL(`https://tumolec.vercel.app/room/${roomCode}`, { margin: 1, width: 200 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [roomCode]);
```

W widoku „dołączonego" uczestnika, pod akapitem `KOD POKOJU: {roomCode}` (linie ~83-85), wstaw obraz QR:

```tsx
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt={`Kod QR pokoju ${roomCode}`}
          className="mx-auto mb-4 h-[160px] w-[160px] rounded-xl bg-white p-2"
        />
      )}
```

- [ ] **Step 4: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi bez błędów TypeScript.

- [ ] **Step 5: (Opcjonalnie) weryfikacja wizualna**

Jeśli Playwright MCP dostępny: otwórz `/room/<dowolny-kod>` po dołączeniu, potwierdź że QR się renderuje i po zeskanowaniu prowadzi do `https://tumolec.vercel.app/room/<kod>`. Jeśli niedostępny — pomiń.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/room/RoomLobby.tsx
git commit -m "feat: kod QR pokoju w lobby"
```

---

## Feature 2: Natywny share (branch `feat/native-share`)

**Cel:** jeden przycisk „Udostępnij" (Web Share API) z fallbackiem do kopiowania linku do schowka. Zero zależności, zero zmian danych/`firestore.rules`.

> **Rozwiązana niejednoznaczność specyfikacji:** spec mówi o „fallbacku do OBECNEGO zachowania (kopiuj do schowka)", ale w kodzie NIE MA obecnie żadnego kopiowania do schowka (potwierdzone grep-em `clipboard`/`navigator.share`/`writeText` — brak trafień poza spec). Ta funkcja wprowadza więc ZARÓWNO przycisk share, JAK I fallback kopiujący — „obecnym sposobem udostępniania" jest dziś jedynie wyświetlony kod pokoju.

### Task 2.1: Przycisk „Udostępnij" z fallbackiem do schowka

**Files:**
- Modify: `src/components/room/RoomLobby.tsx`

**Interfaces:**
- Consumes: `RoomLobby({ roomCode })` — sekcja przycisków „dołączonego" widoku (linie ~105-132, kontener z linkami „Pula gier"/„Rzut monetą" itd.).
- Produces: nic dla innych zadań.

- [ ] **Step 1: Utwórz branch**

```bash
git checkout master && git pull && git checkout -b feat/native-share
```

- [ ] **Step 2: Dodaj stan i handler share w RoomLobby**

W `src/components/room/RoomLobby.tsx`, po istniejących `useState` w komponencie `RoomLobby`, dodaj:

```tsx
  const [copied, setCopied] = useState(false);

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
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
```

- [ ] **Step 3: Dodaj przycisk share w widoku dołączonego uczestnika**

W kontenerze przycisków (`<div className="flex flex-col gap-3">`, linie ~105-132), NA GÓRZE tego kontenera (przed linkiem „Pula gier →"), wstaw:

```tsx
        <button
          type="button"
          onClick={handleShare}
          className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
        >
          {copied ? "Skopiowano link!" : "Udostępnij pokój"}
        </button>
```

- [ ] **Step 4: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi bez błędów.

- [ ] **Step 5: Commit**

```bash
git add src/components/room/RoomLobby.tsx
git commit -m "feat: natywny share pokoju z fallbackiem do schowka"
```

---

## Feature 3: Naprawa sesji eliminacji + rozszerzona historia (branch `feat/sesje-eliminacji-historia`)

**Cel:** naprawić błąd, w którym druga rozgrywka swipe w tym samym pokoju czyta stare, zakończone dokumenty rund i pokazuje starego zwycięzcę; oraz dodać rozwijany, rundowy przebieg każdej rozegranej gry w widoku historii.

> **Rozwiązana niejednoznaczność / rozszerzenie specyfikacji (WAŻNE — flag dla team-lead):**
> Spec proponuje naprawę „field-only": dodać pole `sessionId` do dokumentu rundy, zachowując PŁASKIE ID rund (`round-1`, `round-2`, …) i nadpisując je przy nowej sesji. Analiza kodu (`SwipeScreen.tsx:111-113` + `rooms.ts:144-171`) pokazała, że to NIE wystarcza:
> 1. **Kolizja swipe'ów:** swipe'y żyją w podkolekcji `eliminationRounds/{roundId}/swipes` z `swipeId = ${participantId}_${steamAppId}` i regułą `allow update, delete: if false`. Nadpisując `round-1` przy nowej sesji, STARE swipe'y zostają. `subscribeToRoundSwipes` czyta je wszystkie, a bramka ukończenia `swipes.length < poolAtStart.length * participants.length` odpala się natychmiast na nieaktualnych danych → runda „kończy się" bez głosowania, z błędnym zwycięzcą.
> 2. **Utrata historii:** nadpisywanie `round-1` niszczy rundy poprzednich sesji → rozbudowana historia działałaby tylko dla ostatniej rozgrywki.
>
> **Rozwiązanie:** scope'ujemy ID dokumentów rund przez sesję: `roundId = ${sessionId}-round-${roundNumber}`. To w pełni realizuje intencję specyfikacji („rozróżnienie której sesji rundy należą"), daje świeżą podkolekcję swipe'ów per sesja (brak kolizji) i zachowuje wszystkie sesje w historii. Pole `sessionId` zostaje zdenormalizowane w dokumencie (do grupowania w historii). Koszt: przy równoległym starcie PIERWSZEJ rundy dwóch klientów może powstać dwie sesje — `getActiveRound` wybiera deterministycznie sesję o najmniejszym `sessionId`, więc wszyscy się zbiegają; osierocona sesja jest nieszkodliwa (jej rundy nigdy nie mają finału z jedynym ocalałym, więc nie pojawia się w historii).

### Task 3.1: Scope'owanie rund przez sesję (warstwa danych + reguły + naprawa SwipeScreen)

**Files:**
- Modify: `src/lib/rooms.ts` (typ `RoundDoc`, `startRound`, nowe `getActiveRound`, `subscribeToEliminationRounds`)
- Modify: `src/components/room/SwipeScreen.tsx` (bootstrap sesji + przekazywanie `sessionId`)
- Modify: `firestore.rules` (`eliminationRounds` create: dopuść `sessionId`)

**Interfaces:**
- Produces (używane przez Task 3.2/3.3):
  - `RoundDoc = { roundNumber: number; poolAtStart: number[]; status: "voting" | "finished"; survivors: number[] | null; sessionId: string }`
  - `startRound(roomCode: string, sessionId: string, roundNumber: number, poolAtStart: number[]): Promise<string>` — zapisuje pod `${sessionId}-round-${roundNumber}`, zwraca to ID.
  - `getActiveRound(roomCode: string): Promise<{ sessionId: string; roundNumber: number } | null>`
  - `subscribeToEliminationRounds(roomCode: string, onChange: (rounds: RoundDoc[]) => void): () => void`

- [ ] **Step 1: Utwórz branch**

```bash
git checkout master && git pull && git checkout -b feat/sesje-eliminacji-historia
```

- [ ] **Step 2: Rozszerz importy Firestore w rooms.ts**

W `src/lib/rooms.ts`, w istniejącym imporcie z `firebase/firestore` (linie 6-19), dodaj `getDocs`, `query`, `where`:

```tsx
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
```

- [ ] **Step 3: Dodaj `sessionId` do `RoundDoc` i przepisz `startRound`**

W `src/lib/rooms.ts`, zamień istniejący `startRound` (linie ~134-142) na wersję z `sessionId`:

```tsx
export async function startRound(
  roomCode: string,
  sessionId: string,
  roundNumber: number,
  poolAtStart: number[],
): Promise<string> {
  const roundId = `${sessionId}-round-${roundNumber}`;
  await setDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId), {
    sessionId,
    roundNumber,
    poolAtStart,
    status: "voting",
  });
  return roundId;
}
```

Zamień typ `RoundDoc` (linie ~173-178) na:

```tsx
export type RoundDoc = {
  roundNumber: number;
  poolAtStart: number[];
  status: "voting" | "finished";
  survivors: number[] | null;
  sessionId: string;
};
```

- [ ] **Step 4: Dodaj `getActiveRound` i `subscribeToEliminationRounds`**

W `src/lib/rooms.ts`, zaraz po `getRound` (po linii ~183), dodaj:

```tsx
/** Znajduje trwającą sekwencję eliminacji, żeby świeży mount/nowy klient
 * dołączył do niej zamiast startować równoległą. Determinizm przy wyścigu:
 * gdy dwóch klientów wystartowało równolegle różne sesje, wszyscy zbiegają
 * się do tej o najmniejszym sessionId (reszta zostaje osierocona, nieszkodliwa). */
export async function getActiveRound(
  roomCode: string,
): Promise<{ sessionId: string; roundNumber: number } | null> {
  const q = query(
    collection(db, "rooms", roomCode, "eliminationRounds"),
    where("status", "==", "voting"),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const rounds = snap.docs.map((d) => d.data() as RoundDoc);
  rounds.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  return { sessionId: rounds[0].sessionId, roundNumber: rounds[0].roundNumber };
}

/** Wszystkie rundy pokoju (do rozbudowanej historii). */
export function subscribeToEliminationRounds(
  roomCode: string,
  onChange: (rounds: RoundDoc[]) => void,
) {
  return onSnapshot(collection(db, "rooms", roomCode, "eliminationRounds"), (snap) => {
    onChange(snap.docs.map((d) => d.data() as RoundDoc));
  });
}
```

- [ ] **Step 5: Zaktualizuj regułę create dla `eliminationRounds`**

W `firestore.rules`, w bloku `match /eliminationRounds/{roundId}`, zamień regułę `allow create` (linie 46-48). Diff:

```diff
         allow create: if request.resource.data.roundNumber is number
           && request.resource.data.poolAtStart is list
+          && request.resource.data.sessionId is string
           && request.resource.data.status == 'voting';
```

Reguła `allow update` (tylko `status`/`survivors`) zostaje bez zmian — `sessionId` jest niezmienny po utworzeniu.

- [ ] **Step 6: Przepisz SwipeScreen na bootstrap sesji**

Zamień CAŁĄ zawartość `src/components/room/SwipeScreen.tsx` na:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { WinnerScreen } from "@/components/room/WinnerScreen";
import { useParticipant } from "@/lib/useParticipant";
import {
  subscribeToGamePool,
  subscribeToParticipants,
  getActiveRound,
  startRound,
  subscribeToRound,
  subscribeToRoundSwipes,
  castSwipe,
  finishRound,
  type PoolGame,
  type Participant,
  type RoundDoc,
} from "@/lib/rooms";
import { resolveRound, type Swipe } from "@/lib/elimination";

/** Talia swipe + orkiestracja rund eliminacji. Mechanika (odcinanie najsłabszej
 * połowy, remisy) liczona w lib/elimination.ts -- ten komponent tylko łączy ją
 * z Firestore i UI. Rundy są scope'owane przez sessionId (roundId =
 * `${sessionId}-round-${n}`), więc kolejna rozgrywka w tym samym pokoju dostaje
 * świeże dokumenty i świeże podkolekcje swipe'ów. Szczegóły: work/active/Tumolec.md. */
export function SwipeScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [poolGames, setPoolGames] = useState<PoolGame[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [session, setSession] = useState<{ sessionId: string; roundNumber: number } | null>(null);
  const bootstrapping = useRef(false);

  useEffect(() => subscribeToGamePool(roomCode, setPoolGames), [roomCode]);
  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);

  // Ustala sesję: przejmuje trwającą rundę "voting", albo startuje nową sesję.
  useEffect(() => {
    if (session || bootstrapping.current) return;
    const active = poolGames.filter((g) => g.status === "active").map((g) => g.steamAppId);
    if (active.length < 2) return;
    bootstrapping.current = true;
    getActiveRound(roomCode).then((existing) => {
      if (existing) {
        setSession({ sessionId: existing.sessionId, roundNumber: existing.roundNumber });
      } else {
        const sessionId = crypto.randomUUID();
        startRound(roomCode, sessionId, 1, active);
        setSession({ sessionId, roundNumber: 1 });
      }
      bootstrapping.current = false;
    });
  }, [roomCode, poolGames, session]);

  const gameByAppId = new Map(poolGames.map((g) => [g.steamAppId, g]));
  const activeGames = poolGames.filter((g) => g.status === "active");

  if (!participantId) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dołącz do pokoju w lobby.</p>;
  }
  if (activeGames.length < 2) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dodaj co najmniej 2 gry w puli.</p>;
  }
  if (!session) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }

  return (
    <RoundVoting
      // `key` wymusza pełny remount przy zmianie rundy -- inaczej stan `round`/
      // `swipes` dwóch niezależnych subskrypcji mógłby się na chwilę rozjechać.
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
}

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
  gameByAppId: Map<number, PoolGame>;
  onAdvance: () => void;
}) {
  const [round, setRound] = useState<RoundDoc | null>(null);
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const roundId = `${sessionId}-round-${roundNumber}`;

  useEffect(() => {
    const unsubRound = subscribeToRound(roomCode, roundId, (r) => {
      setRound(r);
      if (r?.status === "finished" && r.survivors && r.survivors.length > 1) {
        onAdvance();
      }
    });
    const unsubSwipes = subscribeToRoundSwipes(roomCode, roundId, setSwipes);
    return () => {
      unsubRound();
      unsubSwipes();
    };
  }, [roomCode, roundId, onAdvance]);

  // Gdy wszyscy skończą głosować w tej rundzie, którykolwiek klient ją zamyka.
  // Bezpieczne przy wyścigu: resolveRound jest czystą funkcją tych samych danych.
  useEffect(() => {
    if (!round || round.status !== "voting" || participants.length === 0) return;
    if (swipes.length < round.poolAtStart.length * participants.length) return;

    const result = resolveRound(round.poolAtStart, swipes);
    let finalSurvivors: number[] | null = null;
    if (result.status === "winner") {
      finalSurvivors = [result.steamAppId];
    } else if (result.status === "advance") {
      finalSurvivors = result.survivors;
    } else if (result.status === "tie-break") {
      // TODO(Faza 3+): coinflip jako tie-breaker nie jest tu podpięty (patrz
      // komentarz przy finishRound w lib/rooms.ts). Na razie deterministyczne
      // rozstrzygnięcie (najniższy appid) -- bezpieczne przy wyścigu.
      const brokenTie = [...result.tiedForCutoff].sort((a, b) => a - b).slice(0, result.slotsAvailable);
      finalSurvivors = [...result.survivors, ...brokenTie];
    }
    if (!finalSurvivors) return;

    finishRound(roomCode, roundId, finalSurvivors);
    if (finalSurvivors.length > 1) {
      startRound(roomCode, sessionId, roundNumber + 1, finalSurvivors);
    }
  }, [round, swipes, participants, roomCode, roundId, sessionId, roundNumber]);

  const myVotes = new Set(
    swipes.filter((s) => s.participantId === participantId).map((s) => s.steamAppId),
  );
  const myDeck = round?.poolAtStart.filter((id) => !myVotes.has(id)) ?? [];

  if (round?.status === "finished" && round.survivors?.length === 1) {
    return <WinnerScreen game={gameByAppId.get(round.survivors[0])} />;
  }
  if (!round) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }
  if (myDeck.length === 0) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">Czekam, aż reszta ekipy skończy…</p>
    );
  }

  const currentGame = gameByAppId.get(myDeck[0]);
  if (!currentGame) return null;

  function handleSwipe(direction: "left" | "right") {
    castSwipe(roomCode, roundId, participantId, myDeck[0], direction);
  }

  return (
    <div className="flex h-dvh flex-col">
      <p className="text-text-secondary pt-6 pb-2 text-center text-xs tracking-widest">
        RUNDA {roundNumber} · GRA {round.poolAtStart.length - myDeck.length + 1} Z {round.poolAtStart.length}
      </p>
      <main className="min-h-0 flex-1 px-[22px] pb-[18px]">
        <div className="relative h-full">
          <SwipeCard key={currentGame.steamAppId} game={currentGame} onSwipe={handleSwipe} />
        </div>
      </main>
      <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
    </div>
  );
}
```

- [ ] **Step 7: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi bez błędów TypeScript (potwierdza że nowa sygnatura `startRound` jest spójna we wszystkich miejscach wywołań).

- [ ] **Step 8: Commit**

```bash
git add src/lib/rooms.ts src/components/room/SwipeScreen.tsx firestore.rules
git commit -m "fix: scope rund eliminacji przez sessionId (naprawa powtórnej rozgrywki)"
```

### Task 3.2: Czysta funkcja `sessionBreakdownForGame` (TDD)

**Files:**
- Modify: `src/lib/history.ts`
- Test: `src/lib/history.test.ts`

**Interfaces:**
- Consumes: `RoundDoc` z `@/lib/rooms` (zdefiniowany w Task 3.1).
- Produces (używane przez Task 3.3):
  - `RoundBreakdown = { roundNumber: number; gamesIn: number; survivorsCount: number }`
  - `sessionBreakdownForGame(rounds: RoundDoc[], steamAppId: number): RoundBreakdown[]`

- [ ] **Step 1: Napisz failing test**

W `src/lib/history.test.ts` ZMIEŃ dwie istniejące linie importu (NIE dodawaj duplikatów): linię 2 `import { buildHistory, pluralizeGry } from "./history";` → dopisz `sessionBreakdownForGame`; linię 3 `import type { PoolGame } from "@/lib/rooms";` → dopisz `RoundDoc`. Docelowo:

```tsx
import { buildHistory, pluralizeGry, sessionBreakdownForGame } from "./history";
import type { PoolGame, RoundDoc } from "@/lib/rooms";
```

Następnie dopisz na końcu pliku nowy blok `describe`. Wartości `gamesIn`/`survivorsCount` policzone ręcznie: sesja "s1" ma rundę 1 (pula [1,2,3,4] → ocaleli [1,2]) i rundę 2 (pula [1,2] → ocalał [1]); sesja "s2" ma rundę 1 (pula [5,6] → ocalał [5]).

```tsx
function round(partial: Partial<RoundDoc> & Pick<RoundDoc, "sessionId" | "roundNumber">): RoundDoc {
  return {
    poolAtStart: [],
    status: "finished",
    survivors: null,
    ...partial,
  };
}

describe("sessionBreakdownForGame", () => {
  const rounds: RoundDoc[] = [
    round({ sessionId: "s1", roundNumber: 1, poolAtStart: [1, 2, 3, 4], survivors: [1, 2] }),
    round({ sessionId: "s1", roundNumber: 2, poolAtStart: [1, 2], survivors: [1] }),
    round({ sessionId: "s2", roundNumber: 1, poolAtStart: [5, 6], survivors: [5] }),
  ];

  it("returns the full session breakdown for the winning game, ordered by round", () => {
    expect(sessionBreakdownForGame(rounds, 1)).toEqual([
      { roundNumber: 1, gamesIn: 4, survivorsCount: 2 },
      { roundNumber: 2, gamesIn: 2, survivorsCount: 1 },
    ]);
  });

  it("isolates a different session's winner without mixing rounds", () => {
    expect(sessionBreakdownForGame(rounds, 5)).toEqual([
      { roundNumber: 1, gamesIn: 2, survivorsCount: 1 },
    ]);
  });

  it("returns empty when the game was never a sole survivor (e.g. eliminated, or won via coinflip)", () => {
    expect(sessionBreakdownForGame(rounds, 2)).toEqual([]);
    expect(sessionBreakdownForGame(rounds, 99)).toEqual([]);
  });
});
```

- [ ] **Step 2: Uruchom test — musi FAIL**

Run: `npx vitest run src/lib/history.test.ts`
Expected: FAIL — `sessionBreakdownForGame is not a function` / brak eksportu.

- [ ] **Step 3: Zaimplementuj `sessionBreakdownForGame`**

W `src/lib/history.ts`, zmień import na górze, żeby dociągnąć `RoundDoc`:

```tsx
import type { PoolGame, RoundDoc } from "@/lib/rooms";
```

i dopisz na końcu pliku:

```tsx
export type RoundBreakdown = { roundNumber: number; gamesIn: number; survivorsCount: number };

/** Dla wygranej gry (jedyny ocalały finałowej rundy) zwraca przebieg CAŁEJ jej
 * sesji: numer rundy, ile gier weszło, ilu ocalało. Pusta lista, gdy gra nigdy
 * nie była jedynym ocalałym (wyeliminowana albo wybrana inną mini-grą niż swipe). */
export function sessionBreakdownForGame(rounds: RoundDoc[], steamAppId: number): RoundBreakdown[] {
  const finalRound = rounds.find(
    (r) => r.status === "finished" && r.survivors?.length === 1 && r.survivors[0] === steamAppId,
  );
  if (!finalRound) return [];
  return rounds
    .filter((r) => r.sessionId === finalRound.sessionId)
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((r) => ({
      roundNumber: r.roundNumber,
      gamesIn: r.poolAtStart.length,
      survivorsCount: r.survivors?.length ?? 0,
    }));
}
```

- [ ] **Step 4: Uruchom test — musi PASS**

Run: `npx vitest run src/lib/history.test.ts`
Expected: PASS (wszystkie `describe`, łącznie z istniejącymi `buildHistory`/`pluralizeGry`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/history.ts src/lib/history.test.ts
git commit -m "feat: sessionBreakdownForGame - przebieg rund wygranej gry"
```

### Task 3.3: Rozwijany przebieg rund w HistoryScreen

**Files:**
- Modify: `src/components/room/HistoryScreen.tsx`

**Interfaces:**
- Consumes: `subscribeToEliminationRounds`, `RoundDoc` (Task 3.1); `sessionBreakdownForGame` (Task 3.2); istniejące `buildHistory`, `pluralizeGry`, `subscribeToGamePool`, `PoolGame`.
- Produces: nic dla innych zadań.

- [ ] **Step 1: Przepisz HistoryScreen z subskrypcją rund i rozwijaniem**

Zamień CAŁĄ zawartość `src/components/room/HistoryScreen.tsx` na:

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { subscribeToGamePool, subscribeToEliminationRounds, type PoolGame, type RoundDoc } from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import { buildHistory, pluralizeGry, sessionBreakdownForGame } from "@/lib/history";

export function HistoryScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [games, setGames] = useState<PoolGame[]>([]);
  const [rounds, setRounds] = useState<RoundDoc[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => subscribeToGamePool(roomCode, setGames), [roomCode]);
  useEffect(() => subscribeToEliminationRounds(roomCode, setRounds), [roomCode]);

  const history = buildHistory(games);

  if (!participantId) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">
        Wróć do <Link href={`/room/${roomCode}`} className="underline">lobby</Link>, żeby dołączyć do pokoju.
      </p>
    );
  }

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
        <h1 className="font-heading text-[18px] font-bold text-foreground">Historia</h1>
      </div>

      {history.totalPlayed === 0 ? (
        <p className="text-text-secondary py-8 text-center text-sm">
          Jeszcze nie zagraliście w żadną grę. Oznacz grę jako „Zagrane" w puli.
        </p>
      ) : (
        <>
          <p className="text-sm font-bold text-foreground">
            Zagraliście razem w {history.totalPlayed} {pluralizeGry(history.totalPlayed)} 🎮
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul className="flex flex-col gap-3">
              {history.games.map((game) => {
                const breakdown = sessionBreakdownForGame(rounds, game.steamAppId);
                const isOpen = expanded === game.steamAppId;
                return (
                  <li
                    key={game.steamAppId}
                    className="bg-card border-border flex flex-col gap-2 rounded-xl border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {game.coverImageUrl && (
                        <Image
                          src={game.coverImageUrl}
                          alt=""
                          width={96}
                          height={48}
                          className="h-12 w-24 shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{game.title}</p>
                        <p className="text-text-secondary text-xs">
                          {game.playedAt
                            ? new Date(game.playedAt).toLocaleDateString("pl-PL", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })
                            : "przed chwilą"}
                        </p>
                      </div>
                      {breakdown.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : game.steamAppId)}
                          className="bg-secondary text-text-secondary shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                        >
                          {isOpen ? "Ukryj" : "Przebieg"}
                        </button>
                      )}
                    </div>

                    {isOpen && breakdown.length > 0 && (
                      <ol className="border-border flex flex-col gap-1 border-t pt-2">
                        {breakdown.map((r) => (
                          <li key={r.roundNumber} className="text-text-secondary text-xs">
                            Runda {r.roundNumber}: {r.gamesIn} {pluralizeGry(r.gamesIn)} → dalej{" "}
                            {r.survivorsCount} {pluralizeGry(r.survivorsCount)}
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi.

- [ ] **Step 3: Commit**

```bash
git add src/components/room/HistoryScreen.tsx
git commit -m "feat: rozwijany przebieg rund per gra w historii"
```

### Task 3.4: Weryfikacja grupy Feature 3

- [ ] **Step 1: Pełny build + testy**

Run: `npm run build && npx vitest run`
Expected: build zielony, wszystkie testy przechodzą (w tym nowe `sessionBreakdownForGame` i istniejące `resolveRound`/`buildHistory`).

- [ ] **Step 2: (Opcjonalnie) weryfikacja wizualna**

Jeśli Playwright MCP dostępny: rozegraj sekwencję swipe do końca (gra oznaczona „Zagrane"), potem rozpocznij DRUGĄ rozgrywkę w tym samym pokoju — potwierdź, że startuje świeża runda 1 (nie pokazuje starego zwycięzcy). W historii rozwiń „Przebieg" wygranej gry i potwierdź listę rund. Jeśli niedostępny — pomiń.

---

## Feature 4: Paczki gier (branch `feat/paczki-gier`)

**Cel:** zapisać aktualną aktywną pulę pokoju pod nazwą jako „paczkę" i móc jednym kliknięciem dodać jej gry do dowolnego pokoju (pomijając gry już obecne). Globalna, wspólna lista paczek, niezmienna po zapisaniu (v1).

**Model danych — nowa kolekcja top-level `packages/{packageId}`:** `name: string`, `createdAt: timestamp`, `gameIds: number[]`.

### Task 4.1: Czysta funkcja `newGameIdsForPool` (TDD)

**Files:**
- Create: `src/lib/packages.ts`
- Test: `src/lib/packages.test.ts`

**Interfaces:**
- Consumes: `PoolGame` z `@/lib/rooms`.
- Produces (używane przez Task 4.3): `newGameIdsForPool(packageGameIds: number[], poolGames: PoolGame[]): number[]`

- [ ] **Step 1: Utwórz branch**

```bash
git checkout master && git pull && git checkout -b feat/paczki-gier
```

- [ ] **Step 2: Napisz failing test**

Utwórz `src/lib/packages.test.ts`:

```tsx
import { describe, expect, it } from "vitest";
import { newGameIdsForPool } from "./packages";
import type { PoolGame } from "@/lib/rooms";

function game(partial: Partial<PoolGame> & Pick<PoolGame, "steamAppId" | "status">): PoolGame {
  return {
    title: `Game ${partial.steamAppId}`,
    tags: [],
    reviewScorePercent: 0,
    reviewSummary: "",
    addedBy: "p1",
    playedAt: null,
    ...partial,
  };
}

describe("newGameIdsForPool", () => {
  it("returns every package id when the pool is empty", () => {
    expect(newGameIdsForPool([1, 2, 3], [])).toEqual([1, 2, 3]);
  });

  it("skips ids already present in the pool regardless of their status", () => {
    // Gra 1 jest 'played', gra 2 'active' -- obie liczą się jako obecne, więc
    // z paczki [1,2,3] nowa jest tylko 3 (nie nadpisujemy stanu played/active).
    const pool = [
      game({ steamAppId: 1, status: "played" }),
      game({ steamAppId: 2, status: "active" }),
    ];
    expect(newGameIdsForPool([1, 2, 3], pool)).toEqual([3]);
  });

  it("returns empty when all package ids are already in the pool", () => {
    const pool = [game({ steamAppId: 1, status: "removed" }), game({ steamAppId: 2, status: "active" })];
    expect(newGameIdsForPool([1, 2], pool)).toEqual([]);
  });

  it("preserves package order for the new ids", () => {
    const pool = [game({ steamAppId: 5, status: "active" })];
    expect(newGameIdsForPool([9, 5, 7], pool)).toEqual([9, 7]);
  });
});
```

- [ ] **Step 3: Uruchom test — musi FAIL**

Run: `npx vitest run src/lib/packages.test.ts`
Expected: FAIL — brak modułu `./packages` / `newGameIdsForPool is not a function`.

- [ ] **Step 4: Zaimplementuj**

Utwórz `src/lib/packages.ts`:

```tsx
/** Paczki gier: czysta funkcja diff-u paczki względem puli pokoju, bez
 * zależności od Firestore/UI (analogicznie do lib/elimination.ts). */

import type { PoolGame } from "@/lib/rooms";

/** Które gry z paczki są NOWE względem obecnej puli. Identyfikacja po steamAppId,
 * niezależnie od statusu gry w puli -- gra już obecna (nawet 'played'/'removed')
 * jest pomijana, żeby dodanie paczki nie przywróciło jej z powrotem na 'active'. */
export function newGameIdsForPool(packageGameIds: number[], poolGames: PoolGame[]): number[] {
  const present = new Set(poolGames.map((g) => g.steamAppId));
  return packageGameIds.filter((id) => !present.has(id));
}
```

- [ ] **Step 5: Uruchom test — musi PASS**

Run: `npx vitest run src/lib/packages.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/packages.ts src/lib/packages.test.ts
git commit -m "feat: newGameIdsForPool - diff paczki względem puli"
```

### Task 4.2: Warstwa danych paczek w rooms.ts + reguły Firestore

**Files:**
- Modify: `src/lib/rooms.ts` (import `addDoc`; typ `GamePackage`; `createPackage`, `subscribeToPackages`, `addGamesToPool`)
- Modify: `firestore.rules` (nowy blok `match /packages/{packageId}`)

**Interfaces:**
- Consumes: istniejące `addGameToPool` (linie ~100-107), `getDoc`, `collection`, `doc`, `serverTimestamp`, `onSnapshot`.
- Produces (używane przez Task 4.3):
  - `GamePackage = { id: string; name: string; gameCount: number; gameIds: number[] }`
  - `createPackage(name: string, gameIds: number[]): Promise<void>`
  - `subscribeToPackages(onChange: (packages: GamePackage[]) => void): () => void`
  - `addGamesToPool(roomCode: string, steamAppIds: number[], addedBy: string): Promise<void>`

- [ ] **Step 1: Dodaj `addDoc` do importu Firestore w rooms.ts**

W `src/lib/rooms.ts`, w imporcie z `firebase/firestore`, dodaj `addDoc` (alfabetycznie, na górze listy):

```tsx
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
```

> **Uwaga przy merge z Feature 3:** Feature 3 też rozszerza ten import (dodaje `getDocs`/`query`/`where`). Przy rebase zachowaj WSZYSTKIE dodane symbole.

- [ ] **Step 2: Dodaj funkcje paczek na końcu rooms.ts**

Dopisz na końcu `src/lib/rooms.ts`:

```tsx
// ── Paczki gier ───────────────────────────────────────────────────────────
// Globalna, wspólna kolekcja top-level `packages/{packageId}` (bez scope'owania
// per pokój -- jedna ekipa znajomych). Niezmienne po zapisaniu (v1): brak update/delete.

export type GamePackage = { id: string; name: string; gameCount: number; gameIds: number[] };

export async function createPackage(name: string, gameIds: number[]): Promise<void> {
  await addDoc(collection(db, "packages"), { name, gameIds, createdAt: serverTimestamp() });
}

export function subscribeToPackages(onChange: (packages: GamePackage[]) => void) {
  return onSnapshot(collection(db, "packages"), (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data() as { name: string; gameIds: number[] };
        return { id: d.id, name: data.name, gameCount: data.gameIds.length, gameIds: data.gameIds };
      }),
    );
  });
}

/** Dodaje wskazane gry do puli pokoju jako 'active'. Każda gra musi mieć wpis
 * w steam_cache (paczka powstaje z już-dodanych gier, więc powinien istnieć) --
 * brak cache pomijamy z cichym logiem zamiast wywalać całą operację. */
export async function addGamesToPool(roomCode: string, steamAppIds: number[], addedBy: string) {
  for (const steamAppId of steamAppIds) {
    const cacheSnap = await getDoc(doc(db, "steam_cache", String(steamAppId)));
    if (!cacheSnap.exists()) {
      console.warn(`Pomijam grę ${steamAppId}: brak wpisu w steam_cache.`);
      continue;
    }
    await addGameToPool(roomCode, steamAppId, addedBy);
  }
}
```

- [ ] **Step 3: Dodaj blok reguł `packages` w firestore.rules**

W `firestore.rules`, na poziomie `match /databases/{database}/documents` (jako rodzeństwo istniejącego `match /steam_cache/{steamAppId}`), tuż PRZED zamykającym `}` bloku `steam_cache` (po linii 96), dodaj:

```diff
       allow write: if request.resource.data.keys().hasOnly([
           'name', 'headerImageUrl', 'steamUrl', 'shortDescription',
           'reviewSummary', 'reviewScorePercent', 'tags',
           'minRequirements', 'recRequirements', 'cachedAt',
         ])
         && request.resource.data.name is string
         && request.resource.data.headerImageUrl is string
         && request.resource.data.steamUrl is string
         && request.resource.data.shortDescription is string
         && request.resource.data.reviewSummary is string
         && request.resource.data.reviewScorePercent is number
         && request.resource.data.tags is list
         && request.resource.data.minRequirements is string
         && request.resource.data.recRequirements is string
         && request.resource.data.cachedAt is number;
     }
+
+    match /packages/{packageId} {
+      allow read: if true;
+      // Paczki tworzone przez klientów (brak logowania). hasOnly zamyka zapis
+      // na dokładnie te trzy pola; niezmienne po utworzeniu.
+      allow create: if request.resource.data.keys().hasOnly(['name', 'createdAt', 'gameIds'])
+        && request.resource.data.name is string
+        && request.resource.data.name.size() <= 60
+        && request.resource.data.gameIds is list;
+      allow update, delete: if false;
+    }
   }
 }
```

- [ ] **Step 4: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rooms.ts firestore.rules
git commit -m "feat: warstwa danych paczek gier + reguły Firestore"
```

### Task 4.3: UI paczek na ekranie puli

**Files:**
- Create: `src/components/room/PackageControls.tsx`
- Modify: `src/components/room/GamePoolScreen.tsx`

**Interfaces:**
- Consumes: `createPackage`, `subscribeToPackages`, `addGamesToPool`, `GamePackage`, `PoolGame` (Task 4.2); `newGameIdsForPool` (Task 4.1).
- Produces: `PackageControls({ roomCode, participantId, games }: { roomCode: string; participantId: string; games: PoolGame[] })`

- [ ] **Step 1: Utwórz PackageControls**

Utwórz `src/components/room/PackageControls.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  createPackage,
  subscribeToPackages,
  addGamesToPool,
  type GamePackage,
  type PoolGame,
} from "@/lib/rooms";
import { newGameIdsForPool } from "@/lib/packages";

export function PackageControls({
  roomCode,
  participantId,
  games,
}: {
  roomCode: string;
  participantId: string;
  games: PoolGame[];
}) {
  const [packages, setPackages] = useState<GamePackage[]>([]);
  const [mode, setMode] = useState<null | "save" | "load">(null);
  const [name, setName] = useState("");

  useEffect(() => subscribeToPackages(setPackages), []);

  const activeIds = games.filter((g) => g.status === "active").map((g) => g.steamAppId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || activeIds.length === 0) return;
    await createPackage(trimmed, activeIds);
    setName("");
    setMode(null);
  }

  async function handleLoad(pkg: GamePackage) {
    await addGamesToPool(roomCode, newGameIdsForPool(pkg.gameIds, games), participantId);
    setMode(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === "save" ? null : "save")}
          disabled={activeIds.length === 0}
          className="bg-secondary flex-1 rounded-full py-2 text-xs font-bold text-foreground disabled:opacity-50"
        >
          Zapisz jako paczkę
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "load" ? null : "load")}
          className="bg-secondary flex-1 rounded-full py-2 text-xs font-bold text-foreground"
        >
          Dodaj z paczki
        </button>
      </div>

      {mode === "save" && (
        <form onSubmit={handleSave} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nazwa paczki…"
            maxLength={60}
            className="bg-card border-border flex-1 rounded-xl border px-4 py-2 text-sm text-foreground"
          />
          <button
            type="submit"
            className="bg-accent-brand rounded-xl px-4 text-sm font-bold text-white"
          >
            Zapisz
          </button>
        </form>
      )}

      {mode === "load" && (
        <ul className="flex flex-col gap-2">
          {packages.length === 0 ? (
            <li className="text-text-secondary py-2 text-center text-xs">
              Brak zapisanych paczek.
            </li>
          ) : (
            packages.map((pkg) => (
              <li
                key={pkg.id}
                className="bg-card border-border flex items-center justify-between rounded-xl border px-4 py-2 text-sm text-foreground"
              >
                <span className="min-w-0 flex-1 truncate">
                  {pkg.name}{" "}
                  <span className="text-text-secondary text-xs">({pkg.gameCount})</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleLoad(pkg)}
                  className="bg-accent-brand shrink-0 rounded-full px-3 py-1 text-xs font-bold text-white"
                >
                  Dodaj
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wepnij PackageControls w GamePoolScreen**

W `src/components/room/GamePoolScreen.tsx`, dodaj import:

```tsx
import { PackageControls } from "@/components/room/PackageControls";
```

i wstaw komponent między `<AddGameForm .../>` a `<div className="min-h-0 flex-1 overflow-y-auto">` (po linii ~42):

```tsx
      <PackageControls roomCode={roomCode} participantId={participantId} games={games} />
```

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi.

- [ ] **Step 4: Commit**

```bash
git add src/components/room/PackageControls.tsx src/components/room/GamePoolScreen.tsx
git commit -m "feat: UI zapisu i dodawania paczek gier w puli"
```

### Task 4.4: Weryfikacja grupy Feature 4

- [ ] **Step 1: Pełny build + testy**

Run: `npm run build && npx vitest run`
Expected: build zielony, wszystkie testy przechodzą (w tym `newGameIdsForPool`).

- [ ] **Step 2: (Opcjonalnie) weryfikacja wizualna**

Jeśli Playwright MCP dostępny: w puli z ≥1 aktywną grą kliknij „Zapisz jako paczkę", nazwij, zapisz; w innym pokoju kliknij „Dodaj z paczki", wybierz paczkę, potwierdź że gry doszły do puli i że powtórne dodanie nie duplikuje. Jeśli niedostępny — pomiń.

---

## Feature 5: Plinko — mini-gra wyboru gry (branch `feat/plinko`)

**Cel:** dosłowna gra Plinko z PRAWDZIWĄ fizyką (Matter.js): kulka spada przez planszę kołków i ląduje w slocie; gra przypisana do zwycięskiego slotu zostaje wybrana. Osobny byt jak coinflip/wheel (nowa zakładka `/room/[code]/plinko`).

**Matematyka slotów (do etykiet szansy, NIE do losowania wyniku):** dla N aktywnych gier plansza ma N slotów i **N-1 rzędów kołków**. Przy ~50/50 odbiciu na każdym rzędzie, szansa slotu k (0-indeksowany) to rozkład dwumianowy `C(N-1, k) / 2^(N-1)`.

**Worked examples (policzone ręcznie, użyte w teście):**
- **n=2** → 1 rząd, `2^1=2`: `C(1,0)/2, C(1,1)/2` = `[0.5, 0.5]`. Suma 1.
- **n=3** → 2 rzędy, `2^2=4`: `C(2,0)/4, C(2,1)/4, C(2,2)/4` = `[0.25, 0.5, 0.25]`. Suma 1.
- **n=4** → **3 rzędy kołków**, `2^3=8`: `C(3,0)=1, C(3,1)=3, C(3,2)=3, C(3,3)=1` → `[0.125, 0.375, 0.375, 0.125]`. Suma 1. (środkowe sloty > brzegowe — naturalna fizyka Plinko, zamierzona).
- **n=5** → 4 rzędy, `2^4=16`: `C(4,0)=1, C(4,1)=4, C(4,2)=6, C(4,3)=4, C(4,4)=1` → `[0.0625, 0.25, 0.375, 0.25, 0.0625]`. Suma 1, symetryczny.

**Synchronizacja:** klient klikający „Zrzuć" generuje `dropSeed` i publikuje go do pola `plinko` w `rooms/{code}/session/state` (merge). Wszyscy klienci uruchamiają lokalnie Matter.js z tym samym seedem. Klient wyzwalający, po zakończeniu SWOJEJ symulacji, publikuje AUTORYTATYWNY `winnerSlot` — to on decyduje, która gra dostaje `setGameStatus(..., "played")`, nawet gdy czyjaś animacja minimalnie się rozjedzie.

**Reguły Firestore:** `session/state` ma już `allow write: if true` — pole `plinko` NIE wymaga nowej reguły (zero zmian w `firestore.rules` w tej grupie).

### Task 5.1: Czysta funkcja `slotProbabilities` (TDD)

**Files:**
- Create: `src/lib/plinko.ts`
- Test: `src/lib/plinko.test.ts`

**Interfaces:**
- Produces (używane przez Task 5.4): `slotProbabilities(n: number): number[]` — zwraca N prawdopodobieństw sumujących się do 1.

- [ ] **Step 1: Utwórz branch**

```bash
git checkout master && git pull && git checkout -b feat/plinko
```

- [ ] **Step 2: Napisz failing test**

Utwórz `src/lib/plinko.test.ts`:

```tsx
import { describe, expect, it } from "vitest";
import { slotProbabilities } from "./plinko";

describe("slotProbabilities", () => {
  it("n=2 -> równe 50/50 (1 rząd kołków)", () => {
    expect(slotProbabilities(2)).toEqual([0.5, 0.5]);
  });

  it("n=3 -> [0.25, 0.5, 0.25] (2 rzędy)", () => {
    expect(slotProbabilities(3)).toEqual([0.25, 0.5, 0.25]);
  });

  it("n=4 -> [0.125, 0.375, 0.375, 0.125] (3 rzędy)", () => {
    expect(slotProbabilities(4)).toEqual([0.125, 0.375, 0.375, 0.125]);
  });

  it("n=5 -> [0.0625, 0.25, 0.375, 0.25, 0.0625] (4 rzędy)", () => {
    expect(slotProbabilities(5)).toEqual([0.0625, 0.25, 0.375, 0.25, 0.0625]);
  });

  it("prawdopodobieństwa sumują się do 1", () => {
    for (const n of [2, 3, 5, 8]) {
      const sum = slotProbabilities(n).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("rozkład jest symetryczny (brzegi równe, środek najwyższy)", () => {
    const p = slotProbabilities(5);
    expect(p[0]).toBeCloseTo(p[4], 10);
    expect(p[1]).toBeCloseTo(p[3], 10);
    expect(p[2]).toBeGreaterThan(p[1]);
  });
});
```

- [ ] **Step 3: Uruchom test — musi FAIL**

Run: `npx vitest run src/lib/plinko.test.ts`
Expected: FAIL — brak modułu `./plinko`.

- [ ] **Step 4: Zaimplementuj**

Utwórz `src/lib/plinko.ts`:

```tsx
/** Plinko: matematyka prawdopodobieństw slotów, bez zależności od Matter.js/UI.
 * Używana WYŁĄCZNIE do etykiet szansy na ekranie ustawienia -- realny wynik
 * zrzutu decyduje symulacja fizyki, nie ta funkcja. Szczegóły: work/active/Tumolec.md. */

/** Współczynnik dwumianowy C(n, k), liczony multiplikatywnie (bez silni). */
function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/** Dla N slotów plansza ma N-1 rzędów kołków. Szansa slotu k (0-indeksowany)
 * przy ~50/50 odbiciu to rozkład dwumianowy C(N-1, k) / 2^(N-1). */
export function slotProbabilities(n: number): number[] {
  const rows = n - 1;
  const total = 2 ** rows;
  return Array.from({ length: n }, (_, k) => binomial(rows, k) / total);
}
```

- [ ] **Step 5: Uruchom test — musi PASS**

Run: `npx vitest run src/lib/plinko.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plinko.ts src/lib/plinko.test.ts
git commit -m "feat: slotProbabilities - rozkład dwumianowy szans slotów Plinko"
```

### Task 5.2: Stan Plinko w rooms.ts (wzorzec merge session/state)

**Files:**
- Modify: `src/lib/rooms.ts`

**Interfaces:**
- Consumes: istniejące `doc`, `setDoc`, `onSnapshot`, `serverTimestamp`, `Timestamp`, `db`.
- Produces (używane przez Task 5.3/5.4/5.5):
  - `PlinkoState = { assignments: number[]; dropSeed: number | null; dropping: boolean; winnerSlot: number | null; triggeredAt: Timestamp | null }`
  - `subscribeToPlinko(roomCode: string, onChange: (plinko: PlinkoState | null) => void): () => void`
  - `setPlinkoAssignments(roomCode: string, assignments: number[]): Promise<void>`
  - `triggerPlinkoDrop(roomCode: string, dropSeed: number): Promise<void>`
  - `publishPlinkoWinner(roomCode: string, winnerSlot: number): Promise<void>`

- [ ] **Step 1: Dopisz funkcje Plinko na końcu rooms.ts**

Dopisz na końcu `src/lib/rooms.ts`:

```tsx
// ── Plinko ────────────────────────────────────────────────────────────────
// Pod `rooms/{roomCode}/session/state`, pole `plinko` -- TEN SAM dokument co
// coinflip/wheel. Zawsze `setDoc` z `{ merge: true }` i zagnieżdżonym `{ plinko }`,
// NIGDY zapis całego dokumentu, żeby nie nadpisać coinflip/wheel.

export type PlinkoState = {
  assignments: number[]; // steamAppId per slot (index = slot); środek listy = środkowe sloty
  dropSeed: number | null;
  dropping: boolean;
  winnerSlot: number | null; // AUTORYTATYWNY wynik od klienta wyzwalającego
  triggeredAt: Timestamp | null;
};

function plinkoStateRef(roomCode: string) {
  return doc(db, "rooms", roomCode, "session", "state");
}

async function mergePlinko(roomCode: string, plinko: Record<string, unknown>) {
  await setDoc(plinkoStateRef(roomCode), { plinko }, { merge: true });
}

/** Ustawia całą tablicę przypisań slotów (zastępuje, nie scala elementów). */
export async function setPlinkoAssignments(roomCode: string, assignments: number[]) {
  await mergePlinko(roomCode, { assignments });
}

/** Klient klikający "Zrzuć" publikuje parametry startowe; wszyscy odgrywają
 * lokalnie tę samą symulację z tego seeda. Reset winnerSlot na null czyści
 * poprzedni zrzut. */
export async function triggerPlinkoDrop(roomCode: string, dropSeed: number) {
  await mergePlinko(roomCode, { dropSeed, dropping: true, winnerSlot: null, triggeredAt: serverTimestamp() });
}

/** Wywoływane WYŁĄCZNIE przez klienta wyzwalającego po zakończeniu jego
 * symulacji -- winnerSlot jest autorytatywny dla wyboru gry. */
export async function publishPlinkoWinner(roomCode: string, winnerSlot: number) {
  await mergePlinko(roomCode, { winnerSlot, dropping: false });
}

export function subscribeToPlinko(roomCode: string, onChange: (plinko: PlinkoState | null) => void) {
  return onSnapshot(plinkoStateRef(roomCode), (snap) => {
    onChange(snap.exists() ? ((snap.data().plinko as PlinkoState | undefined) ?? null) : null);
  });
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rooms.ts
git commit -m "feat: stan Plinko w session/state (wzorzec merge coinflip/wheel)"
```

### Task 5.3: Silnik i plansza Matter.js (PlinkoBoard)

**Files:**
- Modify: `package.json` (zależność `matter-js` + `@types/matter-js`)
- Create: `src/components/plinko/PlinkoBoard.tsx`

**Interfaces:**
- Produces (używane przez Task 5.5): `PlinkoBoard({ assignments, dropSeed, dropping, onSettled }: { assignments: number[]; dropSeed: number | null; dropping: boolean; onSettled: (slot: number) => void })`

- [ ] **Step 1: Zainstaluj Matter.js + typy**

Run: `npm install matter-js && npm install -D @types/matter-js`
Expected: `matter-js` w `dependencies`, `@types/matter-js` w `devDependencies`.

- [ ] **Step 2: Utwórz PlinkoBoard**

Utwórz `src/components/plinko/PlinkoBoard.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import Matter from "matter-js";

// ponytail: stałe fizyki (odstęp kołków, sprężystość, grawitacja) to knoby
// strojenia wizualnego -- dobierz na oko przy weryfikacji, model minimalny ich
// nie widzi. Upgrade path: fixed-step Engine.update jeśli sync wizualny okaże
// się za luźny (autorytatywny winnerSlot i tak chroni wybór gry).
const WIDTH = 320;
const PEG_GAP = 34;
const TOP = 44;
const RESTITUTION = 0.5;
const BALL_RADIUS = 7;

/** Plansza Plinko na Matter.js. Kulka spada z góry z małym, deterministycznym
 * odchyleniem wyliczonym z dropSeed. Gdy się zatrzyma u dołu, wylicza slot z
 * pozycji X i woła onSettled(slot). Wszyscy klienci renderują lokalnie; o wyborze
 * gry i tak decyduje autorytatywny winnerSlot publikowany przez wyzwalającego. */
export function PlinkoBoard({
  assignments,
  dropSeed,
  dropping,
  onSettled,
}: {
  assignments: number[];
  dropSeed: number | null;
  dropping: boolean;
  onSettled: (slot: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref, żeby zmiana identyczności onSettled nie restartowała symulacji.
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const slots = Math.max(2, assignments.length);
  const rows = slots - 1;
  const height = TOP + rows * PEG_GAP + 90;

  useEffect(() => {
    if (dropSeed == null || !dropping || !containerRef.current) return;
    const container = containerRef.current;
    let settled = false;

    const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;
    const engine = Engine.create();
    engine.gravity.y = 1;

    const render = Render.create({
      element: container,
      engine,
      options: { width: WIDTH, height, background: "transparent", wireframes: false },
    });

    // Kołki: trójkątny układ, N-1 rzędów; rząd r ma r+2 kołków.
    const pegs = [];
    for (let r = 0; r < rows; r++) {
      const count = r + 2;
      const rowWidth = (count - 1) * PEG_GAP;
      const startX = WIDTH / 2 - rowWidth / 2;
      const y = TOP + r * PEG_GAP;
      for (let c = 0; c < count; c++) {
        pegs.push(
          Bodies.circle(startX + c * PEG_GAP, y, 3, {
            isStatic: true,
            restitution: RESTITUTION,
            render: { fillStyle: "#6b7280" },
          }),
        );
      }
    }

    const walls = [
      Bodies.rectangle(0, height / 2, 4, height, { isStatic: true }),
      Bodies.rectangle(WIDTH, height / 2, 4, height, { isStatic: true }),
      Bodies.rectangle(WIDTH / 2, height, WIDTH, 4, { isStatic: true }),
    ];

    // Deterministyczne odchylenie startu z dropSeed -> różny tor przy każdym zrzucie.
    const jitter = ((dropSeed % 1000) / 1000 - 0.5) * PEG_GAP;
    const ball = Bodies.circle(WIDTH / 2 + jitter, 12, BALL_RADIUS, {
      restitution: RESTITUTION,
      friction: 0,
      render: { fillStyle: "#c2703d" },
    });

    Composite.add(engine.world, [...pegs, ...walls, ball]);

    const runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    const slotWidth = WIDTH / slots;
    const restingY = height - 90;
    Events.on(engine, "afterUpdate", () => {
      if (settled) return;
      if (ball.position.y >= restingY && Math.abs(ball.velocity.y) < 0.2) {
        settled = true;
        const slot = Math.min(slots - 1, Math.max(0, Math.floor(ball.position.x / slotWidth)));
        onSettledRef.current(slot);
      }
    });

    return () => {
      Render.stop(render);
      Runner.stop(runner);
      Events.off(engine, "afterUpdate");
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      render.canvas.remove();
    };
  }, [dropSeed, dropping, slots, rows, height]);

  return <div ref={containerRef} className="mx-auto" style={{ width: WIDTH, height }} />;
}
```

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi (Matter.js typuje się przez `@types/matter-js`).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/plinko/PlinkoBoard.tsx
git commit -m "feat: plansza Plinko na Matter.js (PlinkoBoard)"
```

### Task 5.4: Ekran ustawienia z etykietami szansy (PlinkoSetup)

**Files:**
- Create: `src/components/plinko/PlinkoSetup.tsx`

**Interfaces:**
- Consumes: `setPlinkoAssignments`, `PlinkoState`, `PoolGame` (Task 5.2); `slotProbabilities` (Task 5.1).
- Produces (używane przez Task 5.5): `PlinkoSetup({ roomCode, plinko, activeGames, onDrop }: { roomCode: string; plinko: PlinkoState; activeGames: PoolGame[]; onDrop: () => void })`

- [ ] **Step 1: Utwórz PlinkoSetup**

Utwórz `src/components/plinko/PlinkoSetup.tsx`. Etykieta szansy = zaokrąglony procent z `slotProbabilities` (przybliżona szansa, bez arbitralnych progów słownych — słowne „Duża/Mała szansa" byłyby opcjonalnym polishem).

```tsx
"use client";

import { setPlinkoAssignments, type PlinkoState, type PoolGame } from "@/lib/rooms";
import { slotProbabilities } from "@/lib/plinko";

export function PlinkoSetup({
  roomCode,
  plinko,
  activeGames,
  onDrop,
}: {
  roomCode: string;
  plinko: PlinkoState;
  activeGames: PoolGame[];
  onDrop: () => void;
}) {
  const gameByAppId = new Map(activeGames.map((g) => [g.steamAppId, g]));
  // Tylko przypisania nadal obecne w aktywnej puli (gra mogła zostać usunięta).
  const order = plinko.assignments.filter((id) => gameByAppId.has(id));
  const probs = slotProbabilities(Math.max(2, order.length));

  function move(index: number, dir: -1 | 1) {
    const next = [...order];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setPlinkoAssignments(roomCode, next);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary text-xs">
        Kolejność = przypisanie do slotów. Środek listy trafia w środkowe sloty (większa szansa).
      </p>
      <ul className="flex flex-col gap-2">
        {order.map((id, i) => (
          <li
            key={id}
            className="bg-card border-border flex items-center gap-2 rounded-xl border px-4 py-2 text-sm text-foreground"
          >
            <span className="min-w-0 flex-1 truncate">{gameByAppId.get(id)?.title ?? "…"}</span>
            <span className="text-text-secondary shrink-0 text-xs">{Math.round(probs[i] * 100)}%</span>
            <button
              type="button"
              aria-label="W górę"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="text-text-secondary shrink-0 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="W dół"
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              className="text-text-secondary shrink-0 disabled:opacity-30"
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={order.length < 2 || plinko.dropping}
        onClick={onDrop}
        className="rounded-full py-3 text-sm font-bold text-white disabled:opacity-50"
        style={{ backgroundColor: "var(--accent-brand)", boxShadow: "0 8px 24px var(--accent-brand-soft)" }}
      >
        {plinko.dropping ? "Kulka leci…" : order.length < 2 ? "Dodaj co najmniej 2 gry" : "Zrzuć"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi.

- [ ] **Step 3: Commit**

```bash
git add src/components/plinko/PlinkoSetup.tsx
git commit -m "feat: ekran ustawienia Plinko z etykietami szansy slotów"
```

### Task 5.5: Orkiestrator, route i link w lobby (PlinkoScreen)

**Files:**
- Create: `src/components/room/PlinkoScreen.tsx`
- Create: `src/app/room/[code]/plinko/page.tsx`
- Modify: `src/components/room/RoomLobby.tsx` (link do Plinko)

**Interfaces:**
- Consumes: `subscribeToGamePool`, `subscribeToPlinko`, `setPlinkoAssignments`, `triggerPlinkoDrop`, `publishPlinkoWinner`, `setGameStatus`, `PoolGame`, `PlinkoState` (Task 5.2); `PlinkoBoard` (5.3); `PlinkoSetup` (5.4); istniejący `WinnerScreen`, `useParticipant`.
- Produces: route `/room/[code]/plinko`.

- [ ] **Step 1: Utwórz PlinkoScreen**

Utwórz `src/components/room/PlinkoScreen.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  subscribeToGamePool,
  subscribeToPlinko,
  setPlinkoAssignments,
  triggerPlinkoDrop,
  publishPlinkoWinner,
  setGameStatus,
  type PoolGame,
  type PlinkoState,
} from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import { PlinkoBoard } from "@/components/plinko/PlinkoBoard";
import { PlinkoSetup } from "@/components/plinko/PlinkoSetup";
import { WinnerScreen } from "@/components/room/WinnerScreen";

const EMPTY: PlinkoState = {
  assignments: [],
  dropSeed: null,
  dropping: false,
  winnerSlot: null,
  triggeredAt: null,
};

export function PlinkoScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [poolGames, setPoolGames] = useState<PoolGame[]>([]);
  const [plinko, setPlinko] = useState<PlinkoState>(EMPTY);
  // Tylko klient, który kliknął "Zrzuć", publikuje wynik + oznacza grę zagraną.
  const triggeredByMe = useRef(false);

  useEffect(() => subscribeToGamePool(roomCode, setPoolGames), [roomCode]);
  useEffect(() => subscribeToPlinko(roomCode, (p) => setPlinko(p ?? EMPTY)), [roomCode]);

  const activeGames = poolGames.filter((g) => g.status === "active");
  const gameByAppId = new Map(poolGames.map((g) => [g.steamAppId, g]));

  // Inicjalizacja przypisań: gdy puste, ustaw aktywne gry w kolejności puli.
  useEffect(() => {
    if (!participantId) return;
    if (plinko.assignments.length === 0 && activeGames.length >= 2) {
      setPlinkoAssignments(roomCode, activeGames.map((g) => g.steamAppId));
    }
  }, [participantId, roomCode, plinko.assignments.length, activeGames]);

  if (!participantId) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">
        Wróć do <Link href={`/room/${roomCode}`} className="underline">lobby</Link>, żeby dołączyć do pokoju.
      </p>
    );
  }
  if (activeGames.length < 2) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dodaj co najmniej 2 gry w puli.</p>;
  }

  function handleDrop() {
    triggeredByMe.current = true;
    triggerPlinkoDrop(roomCode, Math.floor(Math.random() * 1_000_000));
  }

  function handleSettled(slot: number) {
    if (!triggeredByMe.current) return; // tylko wyzwalający publikuje wynik
    triggeredByMe.current = false;
    publishPlinkoWinner(roomCode, slot);
    const winnerAppId = plinko.assignments[slot];
    if (winnerAppId != null) setGameStatus(roomCode, winnerAppId, "played");
  }

  const winnerGame =
    plinko.winnerSlot != null && !plinko.dropping
      ? gameByAppId.get(plinko.assignments[plinko.winnerSlot])
      : undefined;

  if (winnerGame) return <WinnerScreen game={winnerGame} />;

  return (
    <main className="flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[30px]">
      <div className="flex items-center gap-3">
        <Link
          href={`/room/${roomCode}`}
          aria-label="Wstecz"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: "oklch(0.24 0.02 265)" }}
        >
          ‹
        </Link>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Plinko</h1>
      </div>

      <PlinkoBoard
        assignments={plinko.assignments}
        dropSeed={plinko.dropSeed}
        dropping={plinko.dropping}
        onSettled={handleSettled}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <PlinkoSetup roomCode={roomCode} plinko={plinko} activeGames={activeGames} onDrop={handleDrop} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Utwórz route Plinko**

Utwórz `src/app/room/[code]/plinko/page.tsx` (wzorzec identyczny jak `wheel/page.tsx`):

```tsx
import { PlinkoScreen } from "@/components/room/PlinkoScreen";

export default async function PlinkoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlinkoScreen roomCode={code} />;
}
```

- [ ] **Step 3: Dodaj link do Plinko w lobby**

W `src/components/room/RoomLobby.tsx`, w kontenerze przycisków „dołączonego" widoku, obok wiersza z „Rzut monetą"/„Koło fortuny" (linie ~112-125), dodaj trzeci przycisk. Zamień istniejący `<div className="flex gap-3">` z dwoma linkami na wersję z trzecim linkiem w osobnym wierszu:

```tsx
        <div className="flex gap-3">
          <Link
            href={`/room/${roomCode}/coinflip`}
            className="bg-secondary flex-1 rounded-full py-3 text-center text-sm font-bold text-foreground"
          >
            Rzut monetą
          </Link>
          <Link
            href={`/room/${roomCode}/wheel`}
            className="bg-secondary flex-1 rounded-full py-3 text-center text-sm font-bold text-foreground"
          >
            Koło fortuny
          </Link>
        </div>
        <Link
          href={`/room/${roomCode}/plinko`}
          className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
        >
          Plinko
        </Link>
```

> **Uwaga przy merge z Feature 1/2:** te grupy też edytują ten kontener przycisków w RoomLobby. Przy rebase zachowaj wszystkie dodane przyciski (QR/share/Plinko).

- [ ] **Step 4: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi.

- [ ] **Step 5: Commit**

```bash
git add src/components/room/PlinkoScreen.tsx "src/app/room/[code]/plinko/page.tsx" src/components/room/RoomLobby.tsx
git commit -m "feat: ekran Plinko, route i link w lobby"
```

### Task 5.6: Weryfikacja grupy Feature 5

- [ ] **Step 1: Pełny build + testy**

Run: `npm run build && npx vitest run`
Expected: build zielony, wszystkie testy przechodzą (w tym `slotProbabilities`).

- [ ] **Step 2: (Opcjonalnie) weryfikacja wizualna**

Jeśli Playwright MCP dostępny: wejdź na `/room/<kod>/plinko` z ≥2 grami, sprawdź etykiety procentowe (środek > brzegi), przestaw kolejność strzałkami, kliknij „Zrzuć", potwierdź że kulka spada przez kołki i ląduje w slocie, a wygrana gra pokazuje się na WinnerScreen i zostaje oznaczona jako zagrana. Fizykę (odstęp kołków/sprężystość) dostrój na oko jeśli kulka utyka lub zbyt szybko spada. Jeśli Playwright niedostępny — pomiń, ale zaznacz w podsumowaniu, że wizualna weryfikacja Matter.js nie została wykonana.

---
