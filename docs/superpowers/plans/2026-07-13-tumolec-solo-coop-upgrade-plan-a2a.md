# Faza A2a — Upgrade solo→co-op + wspólna biblioteka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pozwolić uczestnikowi trybu solo podnieść sesję do współdzielonego pokoju ("Co-op / Dodaj znajomego") i budować wspólną pulę gier z części wspólnej bibliotek Steam uczestników, bez psucia istniejącego silnika rund eliminacji.

**Architecture:** Rozszerzenie istniejącej warstwy `src/lib/rooms.ts` (Firestore CRUD) o zapis biblioteki Steam uczestnika i wsadowe dodawanie gier; nowa czysta logika (`computeSharedLibrary`, wspólny `matchesMultiplayerFilter`) w `src/lib/steamLibrary.ts`; UI dopięte w trzech istniejących komponentach (`SoloSettingsScreen`, `SoloSwipeScreen`, `RoomLobby`) + nowa sekcja w `GamePoolScreen`. Silnik rund eliminacji (`src/lib/elimination.ts`) pozostaje nietknięty.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Firebase Firestore (client SDK), Vitest.

## Global Constraints

- Zero zmian w silniku rund eliminacji (`src/lib/elimination.ts`, `SwipeScreen.tsx`) — poza zakresem.
- Wszystkie nowe pola Firestore walidowane w `firestore.rules` (kształt + limit rozmiaru), zanim wdrożone na produkcję.
- Testy Vitest tylko dla czystej logiki (`src/lib/*.ts`), nie dla komponentów React — zgodnie z istniejącą konwencją repo (zero RTL/jsdom w projekcie).
- Po każdym zadaniu: `npm run build` musi przejść bez błędów typów.
- Styl UI: kontynuować istniejące klasy Tailwind/tokeny (`bg-card`, `border-border`, `bg-accent-brand`, `text-text-secondary`) — nie wprowadzać nowych tokenów.
- Kod polski (etykiety UI, komunikaty błędów) — zgodnie z resztą aplikacji.

---

## Kontekst dla implementującego

Repo: `C:\Users\miros\tumolec` (Next.js 16 + TypeScript + Tailwind v4 + Firebase Firestore + Vitest). `npm test` = `vitest run`. `npm run build` = `next build`.

Kluczowe pliki, które ten plan modyfikuje lub tworzy:
- `src/lib/rooms.ts` — Firestore CRUD (pokoje, uczestnicy, pula gier, rundy, mini-gry)
- `src/lib/steamLibrary.ts` — czysta logika filtrowania biblioteki Steam (`filterByPlaytime`, `shuffleGames`), colokowany test `steamLibrary.test.ts`
- `src/components/solo/SoloSettingsScreen.tsx` — ekran startowy solo (import biblioteki, filtry, join po kodzie)
- `src/components/solo/SoloSwipeScreen.tsx` — talia swipe'a solo (bez Firestore)
- `src/components/room/RoomLobby.tsx` — lobby pokoju (QR, share, formularz dołączania)
- `src/components/room/GamePoolScreen.tsx` — ekran puli gier pokoju
- `firestore.rules` — reguły bezpieczeństwa

Model docelowy (z `docs/superpowers/specs/2026-07-13-dustpile-inspired-solo-mode-design.md`, sekcja 4):
- Uczestnik pokoju może mieć opcjonalne pole `steamLibraryAppIds: number[]` na swoim dokumencie (`rooms/{code}/participants/{id}`) — appid-y jego biblioteki, przefiltrowane przez backlog, PRZED filtrem solo/multi.
- Gdy ≥2 uczestników ma niepuste `steamLibraryAppIds`, w UI budowania puli pojawia się opcja "Gry, które macie wspólnie" — część wspólna zbiorów, przefiltrowana do gier wieloosobowych, wsadowo dodana do puli.
- Upgrade solo→co-op: tworzy pokój, dodaje aktualną (backlog-przefiltrowaną) listę importu do puli pokoju, pokazuje istniejące lobby z QR/share (zero nowego kodu na sam popup — `RoomLobby` już to renderuje po dołączeniu).

---

## Task 1: `Participant.steamLibraryAppIds` — typ i zapis w `rooms.ts`

**Files:**
- Modify: `src/lib/rooms.ts:64-79` (typ `Participant`, `joinRoom`, `subscribeToParticipants`)

**Interfaces:**
- Produces: `Participant` z opcjonalnym polem `steamLibraryAppIds?: number[]`; `joinRoom(roomCode: string, participantId: string, nickname: string, steamLibraryAppIds?: number[]): Promise<void>`

- [ ] **Step 1: Rozszerz typ i funkcje**

W `src/lib/rooms.ts` zamień linie 64-79 na:

```typescript
export type Participant = { participantId: string; nickname: string; steamLibraryAppIds?: number[] };

export async function joinRoom(
  roomCode: string,
  participantId: string,
  nickname: string,
  steamLibraryAppIds?: number[],
) {
  await setDoc(doc(db, "rooms", roomCode, "participants", participantId), {
    nickname,
    joinedAt: serverTimestamp(),
    ...(steamLibraryAppIds ? { steamLibraryAppIds } : {}),
  });
}

export function subscribeToParticipants(roomCode: string, onChange: (p: Participant[]) => void) {
  return onSnapshot(collection(db, "rooms", roomCode, "participants"), (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data() as { nickname: string; steamLibraryAppIds?: number[] };
        return { participantId: d.id, nickname: data.nickname, steamLibraryAppIds: data.steamLibraryAppIds };
      }),
    );
  });
}
```

- [ ] **Step 2: Zweryfikuj typy**

Run: `npm run build`
Expected: kompilacja bez błędów (istniejący jedyny call site `joinRoom(roomCode, id, joinNickname.trim())` w `RoomLobby.tsx` nadal pasuje, bo nowy parametr jest opcjonalny).

- [ ] **Step 3: Commit**

```bash
git add src/lib/rooms.ts
git commit -m "feat: opcjonalne steamLibraryAppIds na uczestniku pokoju"
```

---

## Task 2: `computeSharedLibrary` — czysta funkcja + test

**Files:**
- Modify: `src/lib/steamLibrary.ts` (dopisz na końcu pliku)
- Test: `src/lib/steamLibrary.test.ts` (dopisz do istniejącego pliku)

**Interfaces:**
- Consumes: nic nowego
- Produces: `computeSharedLibrary(participants: { steamLibraryAppIds?: number[] }[]): number[]`

- [ ] **Step 1: Napisz failing test**

Dopisz do `src/lib/steamLibrary.test.ts`:

```typescript
describe("computeSharedLibrary", () => {
  it("returns empty when fewer than 2 participants have a library", () => {
    expect(computeSharedLibrary([{ steamLibraryAppIds: [1, 2, 3] }, {}])).toEqual([]);
  });

  it("returns the intersection of all participants' libraries", () => {
    const result = computeSharedLibrary([
      { steamLibraryAppIds: [1, 2, 3, 4] },
      { steamLibraryAppIds: [2, 3, 4, 5] },
      { steamLibraryAppIds: [3, 4, 5, 6] },
    ]);
    expect(result.sort()).toEqual([3, 4]);
  });

  it("returns empty when libraries don't overlap", () => {
    expect(computeSharedLibrary([{ steamLibraryAppIds: [1, 2] }, { steamLibraryAppIds: [3, 4] }])).toEqual([]);
  });

  it("ignores participants without a library when computing overlap", () => {
    const result = computeSharedLibrary([
      { steamLibraryAppIds: [1, 2] },
      {},
      { steamLibraryAppIds: [1, 2] },
    ]);
    expect(result.sort()).toEqual([1, 2]);
  });
});
```

Dodaj import na górze pliku testu: `import { computeSharedLibrary, ... } from "./steamLibrary";` (rozszerz istniejący import).

- [ ] **Step 2: Uruchom test, potwierdź fail**

Run: `npx vitest run src/lib/steamLibrary.test.ts`
Expected: FAIL — `computeSharedLibrary is not a function` / `is not exported`.

- [ ] **Step 3: Zaimplementuj**

Dopisz na końcu `src/lib/steamLibrary.ts`:

```typescript
/** Część wspólna bibliotek Steam uczestników pokoju, liczona z co najmniej
 * dwóch niepustych list -- mniej niż dwie biblioteki = nic do przecięcia. */
export function computeSharedLibrary(participants: { steamLibraryAppIds?: number[] }[]): number[] {
  const libraries = participants
    .map((p) => p.steamLibraryAppIds)
    .filter((ids): ids is number[] => Array.isArray(ids) && ids.length > 0);
  if (libraries.length < 2) return [];
  const [first, ...rest] = libraries;
  return first.filter((appId) => rest.every((lib) => lib.includes(appId)));
}
```

- [ ] **Step 4: Uruchom test, potwierdź pass**

Run: `npx vitest run src/lib/steamLibrary.test.ts`
Expected: PASS (wszystkie testy, w tym istniejące dla `filterByPlaytime`/`shuffleGames`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/steamLibrary.ts src/lib/steamLibrary.test.ts
git commit -m "feat: computeSharedLibrary - czesc wspolna bibliotek Steam uczestnikow"
```

---

## Task 3: Wspólny `MultiplayerFilter` + `matchesMultiplayerFilter` w `steamLibrary.ts`

**Kontekst:** `MultiplayerFilter` (typ) i `matchesMultiplayerFilter` (funkcja) dziś żyją zduplikowane/rozbite między `SoloSettingsScreen.tsx` (typ) i `SoloSwipeScreen.tsx` (funkcja lokalna, nieeksportowana). Task 9 potrzebuje tej samej funkcji do filtrowania wspólnej biblioteki — trzeba ją wydzielić i wyeksportować.

**Files:**
- Modify: `src/lib/steamLibrary.ts` (dopisz typ + funkcję)
- Modify: `src/components/solo/SoloSettingsScreen.tsx:10` (usuń lokalną definicję `MultiplayerFilter`, importuj)
- Modify: `src/components/solo/SoloSwipeScreen.tsx:8,23-27` (usuń lokalną `matchesMultiplayerFilter`, importuj)
- Test: `src/lib/steamLibrary.test.ts` (dopisz)

**Interfaces:**
- Produces: `export type MultiplayerFilter = "all" | "solo" | "multi";` i `matchesMultiplayerFilter(tags: string[], filter: MultiplayerFilter): boolean` z `src/lib/steamLibrary.ts`

- [ ] **Step 1: Napisz failing test**

Dopisz do `src/lib/steamLibrary.test.ts`:

```typescript
describe("matchesMultiplayerFilter", () => {
  it("matches everything for 'all'", () => {
    expect(matchesMultiplayerFilter([], "all")).toBe(true);
  });

  it("matches only single-player tag for 'solo'", () => {
    expect(matchesMultiplayerFilter(["Jednoosobowa"], "solo")).toBe(true);
    expect(matchesMultiplayerFilter(["Wieloosobowa"], "solo")).toBe(false);
  });

  it("matches multiplayer or co-op tags for 'multi'", () => {
    expect(matchesMultiplayerFilter(["Wieloosobowa"], "multi")).toBe(true);
    expect(matchesMultiplayerFilter(["Kooperacja"], "multi")).toBe(true);
    expect(matchesMultiplayerFilter(["Jednoosobowa"], "multi")).toBe(false);
  });
});
```

Rozszerz import w teście o `matchesMultiplayerFilter`.

- [ ] **Step 2: Uruchom test, potwierdź fail**

Run: `npx vitest run src/lib/steamLibrary.test.ts`
Expected: FAIL — brak eksportu.

- [ ] **Step 3: Zaimplementuj w `steamLibrary.ts`**

Dopisz:

```typescript
export type MultiplayerFilter = "all" | "solo" | "multi";

// UWAGA: te stringi zależą od /api/steam/details pobierającego dane z l=polish
// (src/lib/steam.ts) -- zmiana tego parametru gdziekolwiek indziej cicho zepsuje
// to dopasowanie (żaden błąd kompilacji, po prostu wszystko przestanie pasować).
export function matchesMultiplayerFilter(tags: string[], filter: MultiplayerFilter): boolean {
  if (filter === "all") return true;
  if (filter === "solo") return tags.includes("Jednoosobowa");
  return tags.includes("Wieloosobowa") || tags.includes("Kooperacja");
}
```

- [ ] **Step 4: Usuń duplikaty i podłącz importy**

W `src/components/solo/SoloSettingsScreen.tsx` zamień linię 10 (`export type MultiplayerFilter = "all" | "solo" | "multi";`) — usuń tę linię, dodaj do importu z `@/lib/steamLibrary` na górze pliku: `type MultiplayerFilter`. Plik nadal eksportuje `MultiplayerFilter` pośrednio przez re-export nie jest potrzebny — zmień w `SoloSwipeScreen.tsx:8` import z `"@/components/solo/SoloSettingsScreen"` na `"@/lib/steamLibrary"`.

W `src/components/solo/SoloSwipeScreen.tsx` usuń linie 20-27 (komentarz + lokalna funkcja `matchesMultiplayerFilter`), dodaj `matchesMultiplayerFilter` do importu z `@/lib/steamLibrary`.

- [ ] **Step 5: Uruchom testy i build**

Run: `npx vitest run && npm run build`
Expected: PASS / kompilacja bez błędów.

- [ ] **Step 6: Commit**

```bash
git add src/lib/steamLibrary.ts src/lib/steamLibrary.test.ts src/components/solo/SoloSettingsScreen.tsx src/components/solo/SoloSwipeScreen.tsx
git commit -m "refactor: wspolny matchesMultiplayerFilter w steamLibrary.ts (potrzebny tez do wspolnej biblioteki)"
```

---

## Task 4: `addGamesToPoolBatch` + `hydrateAndAddGamesToPool` w `rooms.ts`

**Kontekst:** Gry z importu biblioteki Steam (backlog-filtered) i ze wspólnej biblioteki NIGDY nie miały wywołanego `/api/steam/details` (tylko `GetOwnedGames`, appid+playtime, bez okładki/tagów) — więc `steam_cache` dla nich nie istnieje. Istniejący `addGamesToPool` (używany przez paczki) cicho POMIJA gry bez wpisu w cache — dla tego przypadku trzeba najpierw je dociągnąć (`/api/steam/details` populuje cache przy okazji).

**Files:**
- Modify: `src/lib/rooms.ts` (dopisz na końcu, po sekcji Paczki)

**Interfaces:**
- Consumes: `matchesMultiplayerFilter` (opcjonalnie, do filtrowania) — NIE importować tu, filtr przekazywany jako callback z zewnątrz, żeby `rooms.ts` nie zależał od `steamLibrary.ts`
- Produces: `addGamesToPoolBatch(roomCode: string, steamAppIds: number[], addedBy: string): Promise<void>`, `hydrateAndAddGamesToPool(roomCode: string, steamAppIds: number[], addedBy: string, tagFilter?: (tags: string[]) => boolean): Promise<number>` (zwraca liczbę faktycznie dodanych gier)

- [ ] **Step 1: Dodaj import `writeBatch`**

W `src/lib/rooms.ts` w bloku importu z `"firebase/firestore"` (linie 6-23) dodaj `writeBatch` do listy importowanych nazw (alfabetycznie, po `where`).

- [ ] **Step 2: Zaimplementuj**

Dopisz na końcu `src/lib/rooms.ts` (po sekcji Plinko):

```typescript
// ── Import biblioteki Steam / wspólna biblioteka ────────────────────────────

/** Wsadowo dodaje referencje gier do puli pokoju. Zakłada, że steam_cache dla
 * każdego appId już istnieje (patrz hydrateAndAddGamesToPool) -- w przeciwnym
 * razie GamePoolList pokaże tytuł "…" do czasu odświeżenia. */
export async function addGamesToPoolBatch(roomCode: string, steamAppIds: number[], addedBy: string) {
  if (steamAppIds.length === 0) return;
  const batch = writeBatch(db);
  for (const steamAppId of steamAppIds) {
    batch.set(doc(db, "rooms", roomCode, "games", String(steamAppId)), {
      steamAppId,
      addedBy,
      status: "active",
      addedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Dociąga /api/steam/details dla appid-ów, które nigdy nie miały wywołanego
 * appdetails (import biblioteki daje tylko appid+playtime) -- to jednocześnie
 * populuje steam_cache i, jeśli podano tagFilter, pozwala odfiltrować przed
 * dodaniem do puli (np. tylko gry wieloosobowe dla wspólnej biblioteki).
 * Sekwencyjnie: realistyczne rozmiary po filtrze backlogu to dziesiątki gier,
 * nie setki -- zob. spec sekcja 2 "Wydajność". */
export async function hydrateAndAddGamesToPool(
  roomCode: string,
  steamAppIds: number[],
  addedBy: string,
  tagFilter?: (tags: string[]) => boolean,
): Promise<number> {
  const validIds: number[] = [];
  for (const steamAppId of steamAppIds) {
    try {
      const res = await fetch(`/api/steam/details?appid=${steamAppId}`);
      if (!res.ok) continue;
      const data = (await res.json()) as { tags?: string[] };
      if (tagFilter && !tagFilter(data.tags ?? [])) continue;
      validIds.push(steamAppId);
    } catch {
      continue;
    }
  }
  await addGamesToPoolBatch(roomCode, validIds, addedBy);
  return validIds.length;
}
```

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: kompilacja bez błędów.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rooms.ts
git commit -m "feat: addGamesToPoolBatch + hydrateAndAddGamesToPool (import biblioteki -> pula pokoju)"
```

---

## Task 5: `firestore.rules` — walidacja `steamLibraryAppIds`

**Files:**
- Modify: `firestore.rules:21-25` (reguła `create` dla `participants`)

- [ ] **Step 1: Rozszerz regułę**

Zamień blok `match /participants/{participantId} { ... }` (linie 21-25) na:

```
match /participants/{participantId} {
  allow read: if true;
  allow create: if isValidNickname(request.resource.data.nickname)
    && (!('steamLibraryAppIds' in request.resource.data)
        || (request.resource.data.steamLibraryAppIds is list
            && request.resource.data.steamLibraryAppIds.size() <= 3000));
  allow update, delete: if false;
}
```

- [ ] **Step 2: Deploy i weryfikacja**

Run: `firebase deploy --only firestore:rules`
Expected: `✔ cloud.firestore: rules file firestore.rules compiled successfully` / `✔ Deploy complete!`, projekt `tumolec-d67d9`.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: walidacja steamLibraryAppIds w regulach Firestore"
```

---

## Task 6: `SoloSettingsScreen.tsx` — przywróć tworzenie pokoju od zera

**Kontekst:** Faza A1 świadomie usunęła możliwość utworzenia pokoju bez importu biblioteki (tylko dołączanie po kodzie zostało). To jest formalny dług tej fazy — pierwsza rzecz do naprawienia w A2.

**Files:**
- Modify: `src/components/solo/SoloSettingsScreen.tsx`

**Interfaces:**
- Consumes: `createRoom(name: string): Promise<string>`, `joinRoom(roomCode, participantId, nickname): Promise<void>` (z `@/lib/rooms`)

- [ ] **Step 1: Dodaj stan i importy**

Na górze pliku dodaj do importu z `@/lib/rooms`: `createRoom, joinRoom`. Dodaj obok istniejącego stanu (`showJoin` itd.):

```typescript
const [showCreate, setShowCreate] = useState(false);
const [createNickname, setCreateNickname] = useState("");
const [creating, setCreating] = useState(false);
const [createError, setCreateError] = useState<string | null>(null);
```

- [ ] **Step 2: Dodaj handler**

```typescript
async function handleCreateRoom(e: React.FormEvent) {
  e.preventDefault();
  const nickname = createNickname.trim();
  if (!nickname) return;
  setCreating(true);
  setCreateError(null);
  try {
    const code = await createRoom("Wieczór gier");
    const id = crypto.randomUUID();
    await joinRoom(code, id, nickname);
    localStorage.setItem(`tumolec:${code}:participantId`, id);
    localStorage.setItem(`tumolec:${code}:nickname`, nickname);
    router.push(`/room/${code}`);
  } catch {
    setCreateError("Nie udało się utworzyć pokoju. Spróbuj ponownie.");
    setCreating(false);
  }
}
```

- [ ] **Step 3: Dodaj UI**

W bloku `<div className="mt-6 flex flex-col items-center gap-2">` (linia 106), przed przyciskiem "Mam kod pokoju od znajomego", dodaj:

```tsx
<button
  type="button"
  onClick={() => setShowCreate((v) => !v)}
  className="text-text-secondary text-center text-sm underline"
>
  Stwórz pokój dla znajomych
</button>
{showCreate && (
  <form onSubmit={handleCreateRoom} className="mt-2 flex w-full gap-2">
    <input
      value={createNickname}
      onChange={(e) => setCreateNickname(e.target.value)}
      placeholder="Twój pseudonim"
      maxLength={24}
      className="bg-card border-border flex-1 rounded-xl border px-4 py-3 text-foreground"
    />
    <button
      type="submit"
      disabled={creating}
      className="bg-accent-brand rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
    >
      Stwórz
    </button>
  </form>
)}
{createError && <p className="text-pass text-sm">{createError}</p>}
```

- [ ] **Step 4: Zweryfikuj build i ręcznie**

Run: `npm run build`
Expected: bez błędów.

Ręcznie: `npm run dev`, otwórz `/`, kliknij "Stwórz pokój dla znajomych", wpisz pseudonim, potwierdź przekierowanie na `/room/{code}` z widocznym QR/share (to jest już istniejące `RoomLobby`, zero nowego kodu na sam popup).

- [ ] **Step 5: Commit**

```bash
git add src/components/solo/SoloSettingsScreen.tsx
git commit -m "feat: przywroc tworzenie pokoju od zera na ekranie solo (dlug z Fazy A1)"
```

---

## Task 7: `SoloSwipeScreen.tsx` — "Co-op / Dodaj znajomego"

**Files:**
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

**Interfaces:**
- Consumes: `createRoom`, `joinRoom(roomCode, id, nickname, steamLibraryAppIds)`, `hydrateAndAddGamesToPool(roomCode, appIds, addedBy)` (z `@/lib/rooms`)

- [ ] **Step 1: Dodaj importy i stan**

Dodaj `useRouter` z `"next/navigation"`. Dodaj do importu z `@/lib/rooms`: `createRoom, joinRoom, hydrateAndAddGamesToPool`.

```typescript
const router = useRouter();
const [showUpgrade, setShowUpgrade] = useState(false);
const [upgradeNickname, setUpgradeNickname] = useState("");
const [upgrading, setUpgrading] = useState(false);
const [upgradeError, setUpgradeError] = useState<string | null>(null);
```

- [ ] **Step 2: Dodaj handler**

```typescript
async function handleUpgradeToCoop(e: React.FormEvent) {
  e.preventDefault();
  const nickname = upgradeNickname.trim();
  if (!nickname) return;
  setUpgrading(true);
  setUpgradeError(null);
  try {
    const appIds = pool.map((g) => g.steamAppId);
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

- [ ] **Step 3: Dodaj UI**

W nagłówku (`<div className="flex items-center gap-3">`, linia 88), dodaj przycisk po `<h1>`:

```tsx
<button
  type="button"
  onClick={() => setShowUpgrade((v) => !v)}
  className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground"
>
  Co-op / Dodaj znajomego
</button>
```

Zmień otaczający `<div>` na `className="flex items-center gap-3"` (bez zmian) — nagłówek `<h1>` zostaje, przycisk dokłada się jako trzeci element z `ml-auto`.

Poniżej nagłówka, przed `<div className="min-h-0 flex-1">` (linia 100), dodaj:

```tsx
{showUpgrade && (
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

- [ ] **Step 4: Zweryfikuj build i ręcznie**

Run: `npm run build`
Expected: bez błędów.

Ręcznie: wczytaj bibliotekę solo (kilka gier), kliknij "Co-op / Dodaj znajomego", podaj pseudonim, potwierdź przekierowanie na `/room/{code}` i że pula pokoju (`/room/{code}/pool`) zawiera te same gry co import solo.

- [ ] **Step 5: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: upgrade solo->co-op z ekranu swipe (tworzy pokoj, dodaje biblioteke do puli)"
```

---

## Task 8: `RoomLobby.tsx` — dołączający znajomy podaje swój profil Steam

**Files:**
- Modify: `src/components/room/RoomLobby.tsx:70-107` (formularz dołączania bez `participantId`)

**Interfaces:**
- Consumes: `filterByPlaytime`, `type BacklogFilter` (z `@/lib/steamLibrary`), `ToggleChip` (z `@/components/ui/ToggleChip`)

- [ ] **Step 1: Dodaj importy i stan**

Dodaj na górze pliku: `import { ToggleChip } from "@/components/ui/ToggleChip";` i `import { filterByPlaytime, type BacklogFilter } from "@/lib/steamLibrary";`.

W komponencie, obok istniejącego stanu, dodaj:

```typescript
const [joinProfile, setJoinProfile] = useState("");
const [joinBacklog, setJoinBacklog] = useState<BacklogFilter>("never");
```

- [ ] **Step 2: Zmień `handleJoin`**

Zamień istniejący `handleJoin` (linie 71-79) na:

```typescript
async function handleJoin(e: React.FormEvent) {
  e.preventDefault();
  if (!joinNickname.trim()) return;
  setJoining(true);
  const id = crypto.randomUUID();
  let steamLibraryAppIds: number[] | undefined;
  if (joinProfile.trim()) {
    try {
      const res = await fetch(`/api/steam/library?profile=${encodeURIComponent(joinProfile.trim())}`);
      const data = (await res.json()) as { games?: { steamAppId: number; playtimeMinutes: number }[] };
      if (res.ok && data.games) {
        steamLibraryAppIds = filterByPlaytime(data.games as never, joinBacklog).map((g) => g.steamAppId);
      }
    } catch {
      // ponytail: brak biblioteki nie blokuje dolaczenia, wspolna biblioteka
      // po prostu nie bedzie uwzgledniac tego uczestnika
    }
  }
  await joinRoom(roomCode, id, joinNickname.trim(), steamLibraryAppIds);
  save(id, joinNickname.trim());
  setJoining(false);
}
```

- [ ] **Step 3: Dodaj UI pola Steam do formularza**

W formularzu `<form onSubmit={handleJoin} ...>` (linie 88-103), po polu pseudonimu, przed przyciskiem "Dołącz", dodaj:

```tsx
<input
  value={joinProfile}
  onChange={(e) => setJoinProfile(e.target.value)}
  placeholder="Twój profil Steam (opcjonalnie)"
  className="bg-card border-border rounded-xl border px-4 py-3 text-foreground"
/>
{joinProfile.trim() && (
  <ToggleChip
    value={joinBacklog}
    options={[
      { value: "never", label: "Nigdy nie grane" },
      { value: "under2h", label: "Poniżej 2h" },
      { value: "under10h", label: "Poniżej 10h" },
      { value: "abandoned", label: "Porzucone" },
    ]}
    onChange={setJoinBacklog}
    columns={2}
  />
)}
```

- [ ] **Step 4: Zweryfikuj build i ręcznie**

Run: `npm run build`
Expected: bez błędów.

Ręcznie: dołącz do pokoju drugą kartą przeglądarki (incognito) przez link, podaj pseudonim + profil Steam, potwierdź w konsoli Firestore że dokument uczestnika ma `steamLibraryAppIds`.

- [ ] **Step 5: Commit**

```bash
git add src/components/room/RoomLobby.tsx
git commit -m "feat: dolaczajacy do pokoju moze podac profil Steam (backlog-filtered)"
```

---

## Task 9: `GamePoolScreen.tsx` — "Gry, które macie wspólnie"

**Files:**
- Create: `src/components/room/SharedLibrarySection.tsx`
- Modify: `src/components/room/GamePoolScreen.tsx`

**Interfaces:**
- Consumes: `computeSharedLibrary`, `matchesMultiplayerFilter` (z `@/lib/steamLibrary`), `hydrateAndAddGamesToPool`, `subscribeToParticipants`, `type Participant` (z `@/lib/rooms`)

- [ ] **Step 1: Stwórz `SharedLibrarySection.tsx`**

```tsx
"use client";

import { useState } from "react";
import { computeSharedLibrary, matchesMultiplayerFilter } from "@/lib/steamLibrary";
import { hydrateAndAddGamesToPool, type Participant } from "@/lib/rooms";

export function SharedLibrarySection({
  roomCode,
  participantId,
  participants,
}: {
  roomCode: string;
  participantId: string;
  participants: Participant[];
}) {
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const withLibrary = participants.filter((p) => (p.steamLibraryAppIds?.length ?? 0) > 0);
  if (withLibrary.length < 2) return null;

  const shared = computeSharedLibrary(participants);
  if (shared.length === 0) {
    return (
      <p className="text-text-secondary text-center text-xs">
        {withLibrary.length} uczestników podało bibliotekę, ale brak wspólnych gier.
      </p>
    );
  }

  async function handleAdd() {
    setAdding(true);
    setResult(null);
    const added = await hydrateAndAddGamesToPool(roomCode, shared, participantId, (tags) =>
      matchesMultiplayerFilter(tags, "multi"),
    );
    setResult(`Dodano ${added} gier.`);
    setAdding(false);
  }

  return (
    <div className="bg-card border-border flex items-center justify-between rounded-xl border p-3">
      <span className="text-sm text-foreground">
        Gry, które macie wspólnie ({shared.length})
      </span>
      <button
        type="button"
        onClick={handleAdd}
        disabled={adding}
        className="bg-accent-brand shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      >
        {adding ? "Dodaję…" : result ?? "Dodaj do puli"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Podłącz w `GamePoolScreen.tsx`**

Dodaj import: `import { subscribeToParticipants, type Participant } from "@/lib/rooms";` (rozszerz istniejący import z `@/lib/rooms` o `subscribeToParticipants, type Participant`) i `import { SharedLibrarySection } from "@/components/room/SharedLibrarySection";`.

Dodaj stan i subskrypcję:

```typescript
const [participants, setParticipants] = useState<Participant[]>([]);
```

```typescript
useEffect(() => {
  return subscribeToParticipants(roomCode, setParticipants);
}, [roomCode]);
```

(dopisz jako drugi `useEffect`, obok istniejącego `subscribeToGamePool`).

W JSX, po `<AddGameForm ... />` (linia 43) i przed `<PackageControls ... />`, dodaj:

```tsx
{participantId && (
  <SharedLibrarySection roomCode={roomCode} participantId={participantId} participants={participants} />
)}
```

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: bez błędów.

- [ ] **Step 4: Ręczna weryfikacja end-to-end (dwie sesje przeglądarki)**

1. Sesja A: solo → wczytaj bibliotekę → "Co-op / Dodaj znajomego" (Task 7).
2. Sesja B (incognito): dołącz przez link/QR z podaniem profilu Steam (Task 8).
3. Otwórz `/room/{code}/pool` w sesji A: sekcja "Gry, które macie wspólnie" pokazuje liczbę > 0 (jeśli biblioteki się przecinają) i po kliknięciu dodaje gry do puli.

- [ ] **Step 5: Commit**

```bash
git add src/components/room/SharedLibrarySection.tsx src/components/room/GamePoolScreen.tsx
git commit -m "feat: sekcja Gry ktore macie wspolnie w puli pokoju"
```

---

## Self-Review Checklist (wykonane przy pisaniu planu)

1. **Pokrycie spec sekcji 4**: import biblioteki per-uczestnik (Task 1, 8), `computeSharedLibrary` (Task 2), przepływ solo→co-op z popupem QR reużytym bez zmian (Task 6, 7), wspólna biblioteka filtrowana i dodawana do puli (Task 9), `firestore.rules` (Task 5). ✅ Wszystko pokryte. Sekcja 6 (mini-gry pod przyciskiem bocznym) świadomie POZA tym planem — osobny plan A2b.
2. **Brak placeholderów**: każdy krok ma pełny kod, brak "TODO"/"podobnie jak wyżej".
3. **Spójność typów**: `joinRoom` sygnatura rozszerzona w Task 1, używana identycznie w Task 6/7/8; `hydrateAndAddGamesToPool` zdefiniowana w Task 4, użyta identycznie w Task 7/9; `Participant.steamLibraryAppIds` z Task 1 użyte w Task 9.
