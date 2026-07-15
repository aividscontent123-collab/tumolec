# Explore → Polubione → Versus (rdzeń: biblioteki) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nowy sposób budowania decyzji o grze: swobodne przeglądanie (Explore) własnej/wspólnej biblioteki Steam z filtrem gatunku, polubione trafiają do osobnej kolekcji, z której startuje Versus — dzisiejsza eliminacja rundowa (pokój) albo nowy lokalny odpowiednik (solo).

**Architecture:** Rozdzielenie `genres` od `tags` w istniejącym modelu danych Steam. Nowa kolekcja Polubionych równoległa do istniejącej puli (`liked` obok `games` w Firestore, `localStorage` w solo). Explore reużywa istniejące `SwipeCard`/`GameDetailLayout` bez zmian. Versus w pokoju to dokładnie dzisiejsza eliminacja (`resolveRound`, `startRound`) uruchamiana na innym źródle puli po wydzieleniu generycznego komponentu z `SwipeScreen.tsx`. Versus solo to nowy lokalny hook wzorem `useLocalCoinflip`/`useLocalWheel` z Fazy A2b, reużywający tę samą czystą funkcję `resolveRound`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Firebase Firestore (`firebase/firestore` client SDK), Tailwind v4, Vitest.

## Global Constraints

- Zero nowych zależności npm (wszystko da się zbudować istniejącym stackiem).
- Każda nowa czysta funkcja (logika bez React/Firestore) dostaje test Vitest kolokowany w `*.test.ts` — konwencja tego repo (zob. `src/lib/elimination.test.ts`, `src/lib/steamLibrary.test.ts`).
- Komponenty prezentacyjne/hooki z efektami (jak `useLocalCoinflip`) NIE dostają testów — konwencja tego repo, testowana jest tylko czysta logika.
- Stara ręczna pula (`games` collection, `/room/[code]/pool`, `AddGameForm`, `GamePoolList`, `SwipeScreen.tsx` na trasie `/room/[code]/swipe`) zostaje **funkcjonalnie nietknięta** — to zakres tego planu explicite wyklucza usuwanie czegokolwiek.
- `npm run build && npx vitest run` po każdym zadaniu (konwencja repo).
- Katalog Steam ("Odkrywaj" z pełnego katalogu) to **osobny, następny plan** — ten plan pokrywa wyłącznie źródła "własna biblioteka" i "wspólna biblioteka" (spec sekcje 1, 2a, 2b, 3 [wariant bibliotek], 4, 5, 6, 7).

---

## Mapa plików

**Nowe:**
- `src/lib/localLiked.ts` + `.test.ts` — Polubione solo (localStorage)
- `src/lib/useLocalVersus.ts` — lokalny runner rund eliminacji (solo)
- `src/components/ui/MultiToggleChip.tsx` — chipsy wielokrotnego wyboru (gatunki)
- `src/components/solo/SoloLikedScreen.tsx` — ekran Polubionych (solo)
- `src/components/solo/LocalVersusScreen.tsx` — Versus (solo)
- `src/components/room/RoomExploreScreen.tsx` — Explore (pokój, wspólna biblioteka)
- `src/components/room/LikedScreen.tsx` — ekran Polubionych (pokój)
- `src/components/room/EliminationRound.tsx` — generyczny silnik rund eliminacji wydzielony z `SwipeScreen.tsx`, przyjmuje pulę z zewnątrz
- `src/app/room/[code]/explore/page.tsx`
- `src/app/room/[code]/liked/page.tsx`
- `src/app/room/[code]/versus/page.tsx`

**Modyfikowane:**
- `src/lib/steam.ts`, `src/lib/steam.test.ts` — rozdzielenie `genres`/`tags`
- `src/lib/types.ts`, `src/lib/rooms.ts`, `src/app/demo/page.tsx`, `firestore.rules` — propagacja `genres`
- `src/lib/steamLibrary.ts`, `src/lib/steamLibrary.test.ts` — `matchesGenreFilter`
- `src/lib/elimination.ts`, `src/lib/elimination.test.ts` — wydzielenie `breakTieDeterministically`
- `src/lib/rooms.ts`, `firestore.rules` — kolekcja `liked`
- `src/components/solo/SoloSwipeScreen.tsx` — różnicowanie like/pass, zapis Polubionych, filtr gatunku
- `src/components/solo/SoloSettingsScreen.tsx` — UI filtra gatunku
- `src/components/solo/SoloHome.tsx` — nowe ekrany w maszynie stanów
- `src/components/room/SwipeScreen.tsx` — cienki wrapper nad `EliminationRound`
- `src/components/room/RoomLobby.tsx` — link "Eksploruj →" jako primary
- `src/components/room/AddGameForm.tsx` — parametryzowalny cel zapisu (pula albo Polubione)

---

### Task 1: Rozdziel `genres` od `tags` w parserze Steam

**Files:**
- Modify: `src/lib/steam.ts`
- Test: `src/lib/steam.test.ts`

**Interfaces:**
- Produces: `SteamCacheEntry.genres: string[]` (czyste gatunki, bez kategorii)

- [ ] **Step 1: Napisz failing test**

W `src/lib/steam.test.ts`, dodaj do pierwszego testu (`"parses full data with movie, screenshots, release date and reviews"`) nowy `genres` w danych wejściowych i asercję:

```ts
    const data = {
      name: "Hades",
      header_image: "https://example.com/header.jpg",
      short_description: "A rogue-like dungeon crawler.",
      genres: [{ description: "Akcja" }, { description: "RPG" }],
      categories: [{ description: "Single-player" }],
      pc_requirements: { minimum: "min", recommended: "rec" },
      developers: ["Supergiant Games"],
      release_date: { coming_soon: false, date: "17 września 2020" },
      screenshots: [
        { id: 0, path_thumbnail: "https://example.com/thumb0.jpg", path_full: "https://example.com/full0.jpg" },
        { id: 1, path_thumbnail: "https://example.com/thumb1.jpg", path_full: "https://example.com/full1.jpg" },
      ],
      movies: [
        {
          id: 1,
          name: "Trailer",
          thumbnail: "https://example.com/movie-thumb.jpg",
          hls_h264: "https://example.com/trailer.m3u8",
          highlight: true,
        },
      ],
    };
```

i dodaj na końcu bloku asercji tego testu:

```ts
    expect(result.genres).toEqual(["Akcja", "RPG"]);
    expect(result.tags).toEqual(["Akcja", "RPG", "Single-player"]);
```

(Uwaga: `tags` teraz zawiera też gatunki, tak jak dziś — to się nie zmienia, tylko dochodzi osobne pole `genres`.)

Dodaj też nowy, osobny test za istniejącym testem deduplikacji tagów:

```ts
  it("deduplicates genres independently of tags, gdy Steam powtarza opis gatunku", () => {
    const data = {
      name: "Test Game",
      header_image: "",
      short_description: "",
      genres: [{ description: "RPG" }, { description: "RPG" }],
      pc_requirements: {},
    };
    const reviews = { query_summary: { review_score_desc: "", total_positive: 0, total_reviews: 0 } };

    const result = parseSteamAppDetails(1, data, reviews);

    expect(result.genres).toEqual(["RPG"]);
  });
```

- [ ] **Step 2: Uruchom testy, potwierdź że nowe asercje failują**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: FAIL — `result.genres` is `undefined` (property doesn't exist on `SteamCacheEntry` yet, ale TS to złapie dopiero na build; test runtime pokaże `toEqual` fail: `undefined` vs `["Akcja", "RPG"]`).

- [ ] **Step 3: Dodaj `genres` do typu i parsera**

W `src/lib/steam.ts`, w `SteamCacheEntry` (po polu `tags: string[];`):

```ts
  tags: string[];
  genres: string[];
```

W `parseSteamAppDetails`, zamień:

```ts
  const tags = [
    ...new Set([
      ...(data.genres ?? []).map((g) => g.description),
      ...(data.categories ?? []).map((c) => c.description),
    ]),
  ];
```

na:

```ts
  const genres = [...new Set((data.genres ?? []).map((g) => g.description))];
  const tags = [...new Set([...genres, ...(data.categories ?? []).map((c) => c.description)])];
```

i w zwracanym obiekcie, zaraz po `tags,`:

```ts
    tags,
    genres,
```

- [ ] **Step 4: Uruchom testy ponownie**

Run: `npx vitest run src/lib/steam.test.ts`
Expected: PASS (wszystkie testy w pliku, w tym stare)

- [ ] **Step 5: Commit**

```bash
git add src/lib/steam.ts src/lib/steam.test.ts
git commit -m "feat: rozdziel genres od tags w parserze Steam"
```

---

### Task 2: Rozprowadź `genres` przez cały łańcuch typów

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/rooms.ts:97-117` (`toPoolGame`)
- Modify: `src/components/solo/SoloSwipeScreen.tsx:13-28` (`DetailsResponse`), `:64-78` (`setCurrentCard`)
- Modify: `src/app/demo/page.tsx`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `SteamCacheEntry.genres` (Task 1)
- Produces: `SwipeGame.genres: string[]` — konsumowane przez Task 3 (`matchesGenreFilter`) i karty Explore

- [ ] **Step 1: `SwipeGame` w `src/lib/types.ts`**

Dodaj po `tags: string[];`:

```ts
  tags: string[];
  genres: string[];
```

- [ ] **Step 2: `toPoolGame` w `src/lib/rooms.ts`**

Dodaj po `tags: cache?.tags ?? [],`:

```ts
    tags: cache?.tags ?? [],
    genres: cache?.genres ?? [],
```

- [ ] **Step 3: `DetailsResponse` i konstrukcja karty w `SoloSwipeScreen.tsx`**

W typie `DetailsResponse`, dodaj po `tags: string[];`:

```ts
  tags: string[];
  genres: string[];
```

W `setCurrentCard({...})` wewnątrz `advance()`, dodaj po `tags: data.tags,`:

```ts
          tags: data.tags,
          genres: data.genres,
```

- [ ] **Step 4: `demoGame` w `src/app/demo/page.tsx`**

Dodaj po `tags: [...],`:

```ts
  tags: ["Co-op", "Chaotyczne", "1-4 graczy"],
  genres: ["Rekreacyjne"],
```

- [ ] **Step 5: `firestore.rules` — `steam_cache`**

W bloku `match /steam_cache/{steamAppId}`, w `hasOnly([...])` dodaj `'genres'` na końcu listy pól, i w łańcuchu `&&` dodaj na końcu (przed średnikiem):

```
        && request.resource.data.topReviews is list
        && request.resource.data.genres is list;
```

(Zamiast dotychczasowego zakończenia `&& request.resource.data.topReviews is list;` — dopisz `genres` jako kolejny warunek i przenieś średnik.)

- [ ] **Step 6: Build i testy**

Run: `npm run build && npx vitest run`
Expected: build bez błędów typów, wszystkie testy zielone (build złapie każde miejsce budujące `SwipeGame`/`SteamCacheEntry`, któremu brakuje `genres` — jeśli pokaże błąd w innym pliku niż wymienione wyżej, dodaj tam `genres` analogicznie do wzorca w tym kroku)

- [ ] **Step 7: Wdróż `firestore.rules` na produkcję**

Run: `firebase deploy --only firestore:rules`
Expected: "Deploy complete!"

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/rooms.ts src/components/solo/SoloSwipeScreen.tsx src/app/demo/page.tsx firestore.rules
git commit -m "feat: rozprowadz genres przez SwipeGame/SteamCacheEntry"
```

---

### Task 3: Czysta funkcja filtra gatunku

**Files:**
- Modify: `src/lib/steamLibrary.ts`
- Test: `src/lib/steamLibrary.test.ts`

**Interfaces:**
- Consumes: `genres: string[]` (Task 2)
- Produces:
  - `matchesGenreFilter(genres: string[], selected: string[]): boolean` — konsumowane przez Task 7 (solo Explore) i Task 12 (pokój Explore)
  - `GENRE_OPTIONS: { value: string; label: string }[]` — lista czystych gatunków do chipsów, jedno źródło prawdy, konsumowane przez Task 8 (`SoloSettingsScreen`) i Task 12 (`RoomExploreScreen`)

- [ ] **Step 1: Napisz failing test**

Dodaj do `src/lib/steamLibrary.test.ts`:

```ts
describe("matchesGenreFilter", () => {
  it("dopasowuje wszystko, gdy nic nie wybrano", () => {
    expect(matchesGenreFilter(["RPG"], [])).toBe(true);
    expect(matchesGenreFilter([], [])).toBe(true);
  });

  it("dopasowuje gdy gra ma choć jeden z wybranych gatunkow", () => {
    expect(matchesGenreFilter(["Akcja", "RPG"], ["RPG", "Strategie"])).toBe(true);
  });

  it("odrzuca gdy gra nie ma zadnego z wybranych gatunkow", () => {
    expect(matchesGenreFilter(["Sportowe"], ["RPG", "Strategie"])).toBe(false);
  });
});
```

Upewnij się, że `matchesGenreFilter` jest zaimportowane w nagłówku pliku testowego z `"./steamLibrary"` (dopisz do istniejącego importu).

- [ ] **Step 2: Uruchom test, potwierdź że failuje**

Run: `npx vitest run src/lib/steamLibrary.test.ts`
Expected: FAIL — `matchesGenreFilter is not defined`

- [ ] **Step 3: Zaimplementuj**

W `src/lib/steamLibrary.ts`, dodaj na końcu pliku:

```ts
/** Puste `selected` = brak filtra (wszystko przechodzi). W przeciwnym razie
 * gra musi mieć co najmniej jeden z wybranych gatunków. */
export function matchesGenreFilter(genres: string[], selected: string[]): boolean {
  if (selected.length === 0) return true;
  return genres.some((g) => selected.includes(g));
}

/** Czyste gatunki Steam (l=polish) zweryfikowane doświadczalnie podczas
 * brainstormingu -- jedno źródło prawdy dla chipsów filtra, używane przez
 * ustawienia solo i Explore w pokoju. */
export const GENRE_OPTIONS: { value: string; label: string }[] = [
  { value: "Akcja", label: "Akcja" },
  { value: "Przygodowe", label: "Przygodowe" },
  { value: "RPG", label: "RPG" },
  { value: "Strategie", label: "Strategie" },
  { value: "Symulacje", label: "Symulacje" },
  { value: "Niezależne", label: "Niezależne" },
  { value: "Rekreacyjne", label: "Rekreacyjne (Casual)" },
  { value: "Sportowe", label: "Sportowe" },
];
```

- [ ] **Step 4: Uruchom test ponownie**

Run: `npx vitest run src/lib/steamLibrary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/steamLibrary.ts src/lib/steamLibrary.test.ts
git commit -m "feat: matchesGenreFilter - czysta funkcja filtra gatunku"
```

---

### Task 4: Komponent chipsów wielokrotnego wyboru

**Files:**
- Create: `src/components/ui/MultiToggleChip.tsx`

**Interfaces:**
- Produces: `MultiToggleChip<T extends string>` — konsumowane przez Task 8 (`SoloSettingsScreen`) i Task 12 (`RoomExploreScreen`)

- [ ] **Step 1: Utwórz komponent**

```tsx
"use client";

/** Siatka wielokrotnego wyboru (gatunki) -- siostrzany komponent do
 * `ToggleChip` (pojedynczy wybór, backlog/multiplayer). Ten sam wizualny
 * wzorzec (podświetlone obramowanie + poświata), ale `value`/`onChange`
 * operują na tablicy zamiast pojedynczej wartości. */
export function MultiToggleChip<T extends string>({
  value,
  options,
  onChange,
  columns = 2,
}: {
  value: T[];
  options: { value: T; label: string }[];
  onChange: (value: T[]) => void;
  columns?: 2 | 3;
}) {
  function toggle(opt: T) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }

  return (
    <div className={columns === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            className={
              active
                ? "border-accent-brand bg-card rounded-xl border-2 px-4 py-3 text-center text-sm font-semibold text-foreground"
                : "border-border bg-card rounded-xl border px-4 py-3 text-center text-sm font-semibold text-text-secondary"
            }
            style={active ? { boxShadow: `0 0 16px var(--accent-glow)` } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: bez błędów (komponent nieużywany jeszcze nigdzie, ale musi się kompilować)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/MultiToggleChip.tsx
git commit -m "feat: MultiToggleChip - chipsy wielokrotnego wyboru"
```

---

### Task 5: Kolekcja Polubionych w pokoju (Firestore)

**Files:**
- Modify: `src/lib/rooms.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Produces:
  - `type LikedGame = SwipeGame & { likedBy: string[] }`
  - `likeGame(roomCode: string, steamAppId: number, participantId: string): Promise<void>`
  - `unlikeGame(roomCode: string, steamAppId: number, participantId: string): Promise<void>`
  - `subscribeToLiked(roomCode: string, onChange: (games: LikedGame[]) => void): Unsubscribe`
  
  Konsumowane przez Task 12 (`RoomExploreScreen`, `LikedScreen`)

- [ ] **Step 1: Dodaj funkcje do `src/lib/rooms.ts`**

`arrayUnion`/`arrayRemove` są już zaimportowane z `"firebase/firestore"` na górze pliku (używane przez `addWheelEntry`/`removeWheelEntry`) -- nic do dodania w imporcie.

Dodaj na końcu pliku (po sekcji rund eliminacji):

```ts
// ── Polubione (Explore) ──────────────────────────────────────────────────

export type LikedGame = SwipeGame & { likedBy: string[] };

function toLikedGame(likedDoc: QueryDocumentSnapshot<DocumentData>, cache: DocumentData | undefined): LikedGame {
  const d = likedDoc.data();
  return {
    steamAppId: d.steamAppId,
    likedBy: d.likedBy ?? [],
    title: cache?.name ?? "…",
    coverImageUrl: cache?.headerImageUrl,
    tags: cache?.tags ?? [],
    genres: cache?.genres ?? [],
    reviewScorePercent: cache?.reviewScorePercent ?? 0,
    reviewSummary: cache?.reviewSummary ?? "",
    shortDescription: cache?.shortDescription ?? "",
    developers: cache?.developers ?? [],
    releaseDate: cache?.releaseDate ?? null,
    screenshots: cache?.screenshots ?? [],
    trailerHlsUrl: cache?.trailerHlsUrl ?? null,
    trailerThumbnail: cache?.trailerThumbnail ?? null,
    totalReviews: cache?.totalReviews ?? 0,
    topReviews: cache?.topReviews ?? [],
  };
}

/** Zakłada, że steam_cache/{steamAppId} już istnieje (wywołaj
 * /api/steam/details przed pierwszym polubieniem danego appid). */
export async function likeGame(roomCode: string, steamAppId: number, participantId: string) {
  await setDoc(
    doc(db, "rooms", roomCode, "liked", String(steamAppId)),
    { steamAppId, likedBy: arrayUnion(participantId), addedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Nie kasuje dokumentu gdy `likedBy` staje się puste -- świadome uproszczenie,
 * pusty wpis jest odfiltrowywany po stronie klienta w subscribeToLiked. */
export async function unlikeGame(roomCode: string, steamAppId: number, participantId: string) {
  await updateDoc(doc(db, "rooms", roomCode, "liked", String(steamAppId)), {
    likedBy: arrayRemove(participantId),
  });
}

export function subscribeToLiked(roomCode: string, onChange: (games: LikedGame[]) => void) {
  return onSnapshot(collection(db, "rooms", roomCode, "liked"), async (snap) => {
    const games = await Promise.all(
      snap.docs.map(async (likedDoc) => {
        const cacheSnap = await getDoc(doc(db, "steam_cache", String(likedDoc.data().steamAppId)));
        return toLikedGame(likedDoc, cacheSnap.exists() ? cacheSnap.data() : undefined);
      }),
    );
    onChange(games.filter((g) => g.likedBy.length > 0));
  });
}
```

- [ ] **Step 2: `firestore.rules` — nowy blok `liked`**

W `firestore.rules`, wewnątrz `match /rooms/{roomCode} {`, dodaj nowy blok zaraz po `match /session/state { ... }` (przed zamknięciem `match /rooms/{roomCode}`):

```
      match /liked/{steamAppId} {
        allow read: if true;
        // Kształt analogiczny do games -- likedBy to unia uczestników przez
        // arrayUnion, stąd allow update (nie tylko create) na tym samym polu.
        allow create: if request.resource.data.steamAppId is number
          && request.resource.data.likedBy is list
          && request.resource.data.likedBy.size() <= 20;
        allow update: if request.resource.data.diff(resource.data)
          .affectedKeys().hasOnly(['likedBy', 'addedAt'])
          && request.resource.data.likedBy is list
          && request.resource.data.likedBy.size() <= 20;
        allow delete: if false;
      }
```

- [ ] **Step 3: Build i wdróż reguły**

Run: `npm run build`
Expected: bez błędów

Run: `firebase deploy --only firestore:rules`
Expected: "Deploy complete!"

- [ ] **Step 4: Commit**

```bash
git add src/lib/rooms.ts firestore.rules
git commit -m "feat: kolekcja liked w pokoju (likeGame/unlikeGame/subscribeToLiked)"
```

---

### Task 6: Polubione solo (localStorage)

**Files:**
- Create: `src/lib/localLiked.ts`
- Test: `src/lib/localLiked.test.ts`

**Interfaces:**
- Produces:
  - `addLiked(current: number[], steamAppId: number): number[]` (czysta)
  - `removeLiked(current: number[], steamAppId: number): number[]` (czysta)
  - `getLocalLiked(): number[]` (localStorage, nietestowana)
  - `saveLocalLiked(ids: number[]): void` (localStorage, nietestowana)

  Konsumowane przez Task 7 (`SoloSwipeScreen`), Task 9 (`SoloLikedScreen`)

- [ ] **Step 1: Napisz failing test dla czystych funkcji**

```ts
import { describe, expect, it } from "vitest";
import { addLiked, removeLiked } from "./localLiked";

describe("addLiked", () => {
  it("dodaje nowy appid", () => {
    expect(addLiked([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it("nie duplikuje juz obecnego appid", () => {
    expect(addLiked([1, 2], 2)).toEqual([1, 2]);
  });
});

describe("removeLiked", () => {
  it("usuwa appid z listy", () => {
    expect(removeLiked([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("nie wywala sie gdy appid nie istnieje na liscie", () => {
    expect(removeLiked([1, 2], 5)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Uruchom test, potwierdź że failuje**

Run: `npx vitest run src/lib/localLiked.test.ts`
Expected: FAIL — plik `./localLiked` nie istnieje

- [ ] **Step 3: Zaimplementuj**

```ts
"use client";

/** Polubione w trybie solo -- lista appid w localStorage, spójne z resztą
 * trybu solo (decyzje zostają w przeglądarce, zero Firestore). Logika
 * (dodaj/usuń bez duplikatów) jest czystymi funkcjami operującymi na tablicy
 * -- testowalne bez DOM; localStorage get/set to cienkie, nietestowane
 * wrappery (konwencja tego repo, zob. useParticipant.ts). */

const KEY = "tumolec:solo:liked";

export function addLiked(current: number[], steamAppId: number): number[] {
  return current.includes(steamAppId) ? current : [...current, steamAppId];
}

export function removeLiked(current: number[], steamAppId: number): number[] {
  return current.filter((id) => id !== steamAppId);
}

export function getLocalLiked(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalLiked(ids: number[]): void {
  localStorage.setItem(KEY, JSON.stringify(ids));
}
```

- [ ] **Step 4: Uruchom test ponownie**

Run: `npx vitest run src/lib/localLiked.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/localLiked.ts src/lib/localLiked.test.ts
git commit -m "feat: localLiked - Polubione solo w localStorage"
```

---

### Task 7: Solo Explore -- różnicowanie like/pass, zapis Polubionych, filtr gatunku

**Files:**
- Modify: `src/components/solo/SoloSwipeScreen.tsx`

**Interfaces:**
- Consumes: `matchesGenreFilter` (Task 3), `addLiked`/`getLocalLiked`/`saveLocalLiked` (Task 6), `SwipeGame.genres` (Task 2)
- Produces: `SoloSwipeScreen` przyjmuje nowy prop `genreFilter: string[]`, dostaje `onViewLiked` prop (do Task 9)

- [ ] **Step 1: Rozszerz props i importy**

Na górze `src/components/solo/SoloSwipeScreen.tsx`, dodaj do importów:

```ts
import { matchesGenreFilter, matchesMultiplayerFilter, type MultiplayerFilter, type SteamOwnedGame } from "@/lib/steamLibrary";
import { addLiked, getLocalLiked, saveLocalLiked } from "@/lib/localLiked";
```

(zamień istniejący import z `steamLibrary` na powyższy, dodając `matchesGenreFilter`).

Rozszerz sygnaturę komponentu (zamień istniejące `{ pool, multiplayerFilter, onExit }: {...}`):

```ts
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
```

- [ ] **Step 2: Zastosuj filtr gatunku w `advance()`**

W pętli `advance()`, zaraz po `if (!matchesMultiplayerFilter(data.tags, multiplayerFilter)) continue;`, dodaj:

```ts
        if (!matchesGenreFilter(data.genres, genreFilter)) continue;
```

- [ ] **Step 3: Rozróżnij like od pass**

Zamień:

```ts
  function handleSwipe() {
    advance();
  }
```

na:

```ts
  function handleLike() {
    if (currentCard) saveLocalLiked(addLiked(getLocalLiked(), currentCard.steamAppId));
    advance();
  }

  function handlePass() {
    advance();
  }
```

Zamień użycia `handleSwipe` w JSX:

```tsx
            <SwipeCard key={currentCard.steamAppId} game={currentCard} onSwipe={handleSwipe} />
```

na:

```tsx
            <SwipeCard
              key={currentCard.steamAppId}
              game={currentCard}
              onSwipe={(direction) => (direction === "right" ? handleLike() : handlePass())}
            />
```

i:

```tsx
      {!exhausted && !loadingCard && <SwipeActionButtons onPass={handleSwipe} onLike={handleSwipe} />}
```

na:

```tsx
      {!exhausted && !loadingCard && <SwipeActionButtons onPass={handlePass} onLike={handleLike} />}
```

- [ ] **Step 4: Dodaj licznik Polubionych + link do ekranu Polubionych**

W nagłówku (`<div className="flex items-center gap-3">...</div>`), dodaj przed przyciskiem "Co-op / Dodaj znajomego":

```tsx
        <button
          type="button"
          onClick={onViewLiked}
          className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground"
        >
          ❤️ {getLocalLiked().length}
        </button>
```

(usuń `ml-auto` z przycisku "Co-op / Dodaj znajomego" obok, żeby oba przyciski siedziały razem po prawej -- zmień `className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground"` na `className="bg-secondary rounded-full px-4 py-2 text-xs font-bold text-foreground"` na przycisku "Co-op / Dodaj znajomego").

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: błąd typu w `SoloHome.tsx` (brakujące propsy `genreFilter`/`onViewLiked`) -- to oczekiwane, naprawiane w Task 8/9. Potwierdź, że błąd wskazuje dokładnie na `<SoloSwipeScreen ...>` w `SoloHome.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: solo Explore - like/pass, zapis Polubionych, filtr gatunku"
```

---

### Task 8: Filtr gatunku w ustawieniach solo

**Files:**
- Modify: `src/components/solo/SoloSettingsScreen.tsx`

**Interfaces:**
- Consumes: `MultiToggleChip` (Task 4), `GENRE_OPTIONS` (Task 3)
- Produces: `SoloSettingsScreen.onLoadLibrary` dostaje dodatkowy argument `genres: string[]`

- [ ] **Step 1: Dodaj stan i importy**

Zmień import `ToggleChip` i `steamLibrary` na:

```ts
import { ToggleChip } from "@/components/ui/ToggleChip";
import { MultiToggleChip } from "@/components/ui/MultiToggleChip";
```

i dodaj `GENRE_OPTIONS` do istniejącego importu z `@/lib/steamLibrary` (obok `filterByPlaytime`, `BacklogFilter`, `MultiplayerFilter`).

Zmień sygnaturę propsów:

```ts
export function SoloSettingsScreen({
  onLoadLibrary,
  loading,
  error,
}: {
  onLoadLibrary: (profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter, genres: string[]) => void;
  loading: boolean;
  error: string | null;
}) {
```

Dodaj stan (obok `const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("all");`):

```ts
  const [genres, setGenres] = useState<string[]>([]);
```

- [ ] **Step 2: Dodaj UI chipsów gatunków**

Po bloku `<div className="mt-5">...Jak chcesz grać?...</div>`, dodaj:

```tsx
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-foreground">Jaki gatunek?</p>
          <MultiToggleChip value={genres} options={GENRE_OPTIONS} onChange={setGenres} columns={2} />
        </div>
```

- [ ] **Step 3: Przekaż `genres` do `onLoadLibrary`**

Zmień wywołanie w przycisku "Wczytaj bibliotekę":

```tsx
          onClick={() => onLoadLibrary(profile.trim(), backlog, multiplayer)}
```

na:

```tsx
          onClick={() => onLoadLibrary(profile.trim(), backlog, multiplayer, genres)}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: błąd typu w `SoloHome.tsx` (`onLoadLibrary` handler ma za mało parametrów względem nowej sygnatury) -- oczekiwane, naprawiane w kolejnym kroku tego zadania.

- [ ] **Step 5: Napraw `SoloHome.tsx`**

Zmień w `src/components/solo/SoloHome.tsx` sygnaturę `handleLoadLibrary`:

```ts
  async function handleLoadLibrary(profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) {
```

na:

```ts
  async function handleLoadLibrary(
    profile: string,
    backlog: BacklogFilter,
    multiplayer: MultiplayerFilter,
    genres: string[],
  ) {
```

i zmień typ `Screen` oraz miejsce ustawiania ekranu `"swipe"`:

```ts
type Screen =
  | { name: "settings" }
  | { name: "swipe"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter; genres: string[] };
```

```ts
      setScreen({ name: "swipe", pool: shuffleGames(filtered), multiplayer, genres });
```

i przekazanie propsów do `SoloSwipeScreen` (tymczasowo `onViewLiked` jako no-op, naprawiane w Task 9):

```tsx
      <SoloSwipeScreen
        pool={screen.pool}
        multiplayerFilter={screen.multiplayer}
        genreFilter={screen.genres}
        onExit={() => setScreen({ name: "settings" })}
        onViewLiked={() => {}}
      />
```

- [ ] **Step 6: Build i test end-to-end**

Run: `npm run build`
Expected: bez błędów

Ręcznie (`npm run dev`): wczytaj bibliotekę solo z wybranym gatunkiem (np. "RPG"), potwierdź że pokazywane karty faktycznie mają ten gatunek (sprawdź przez "Szczegóły na Steam" albo panel Info).

- [ ] **Step 7: Commit**

```bash
git add src/components/solo/SoloSettingsScreen.tsx src/components/solo/SoloHome.tsx
git commit -m "feat: filtr gatunku w ustawieniach solo"
```

---

### Task 9: Ekran Polubionych (solo)

**Files:**
- Create: `src/components/solo/SoloLikedScreen.tsx`
- Modify: `src/components/solo/SoloHome.tsx`

**Interfaces:**
- Consumes: `getLocalLiked`/`removeLiked`/`saveLocalLiked` (Task 6), `/api/steam/search`, `/api/steam/details` (istniejące)
- Produces: `SoloLikedScreen` z propem `onStartVersus: (games: SwipeGame[]) => void`

- [ ] **Step 1: Utwórz `SoloLikedScreen.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { addLiked, getLocalLiked, removeLiked, saveLocalLiked } from "@/lib/localLiked";
import type { SteamCacheEntry } from "@/lib/steam";
import type { SwipeGame } from "@/lib/types";

type SteamSuggestion = { steamAppId: number; name: string; tinyImage: string };
type DetailsResponse = SteamCacheEntry & { steamAppId: number; error?: string };

function toSwipeGame(data: DetailsResponse): SwipeGame {
  return {
    steamAppId: data.steamAppId,
    title: data.name,
    coverImageUrl: data.headerImageUrl,
    tags: data.tags,
    genres: data.genres,
    reviewScorePercent: data.reviewScorePercent,
    reviewSummary: data.reviewSummary,
    shortDescription: data.shortDescription,
    developers: data.developers,
    releaseDate: data.releaseDate,
    screenshots: data.screenshots,
    trailerHlsUrl: data.trailerHlsUrl,
    trailerThumbnail: data.trailerThumbnail,
    totalReviews: data.totalReviews,
    topReviews: data.topReviews,
  };
}

/** Ekran Polubionych solo -- czyta appidy z localStorage, dociąga pełne dane
 * z steam_cache (przez /api/steam/details, cache-first jak wszędzie indziej),
 * pozwala usunąć i ręcznie dopisać, uruchamia lokalny Versus na wczytanej
 * liście (nie tylko appidach -- unika ponownego fetchowania w LocalVersusScreen). */
export function SoloLikedScreen({
  onBack,
  onStartVersus,
}: {
  onBack: () => void;
  onStartVersus: (games: SwipeGame[]) => void;
}) {
  const [games, setGames] = useState<SwipeGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<SteamSuggestion[]>([]);
  const [adding, setAdding] = useState<number | null>(null);

  async function reload() {
    setLoading(true);
    const ids = getLocalLiked();
    const loaded = await Promise.all(
      ids.map(async (steamAppId) => {
        const res = await fetch(`/api/steam/details?appid=${steamAppId}`);
        const data = (await res.json()) as DetailsResponse;
        if (!res.ok || data.error) return null;
        return toSwipeGame({ ...data, steamAppId });
      }),
    );
    setGames(loaded.filter((g): g is SwipeGame => g !== null));
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRemove(steamAppId: number) {
    saveLocalLiked(removeLiked(getLocalLiked(), steamAppId));
    setGames((gs) => gs.filter((g) => g.steamAppId !== steamAppId));
  }

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (term.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      const res = await fetch(`/api/steam/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      setSuggestions(res.ok ? data.results : []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [term]);

  async function pickGame(suggestion: SteamSuggestion) {
    setAdding(suggestion.steamAppId);
    try {
      const res = await fetch(`/api/steam/details?appid=${suggestion.steamAppId}`);
      const data = (await res.json()) as DetailsResponse;
      if (!res.ok || data.error) return;
      saveLocalLiked(addLiked(getLocalLiked(), suggestion.steamAppId));
      setGames((gs) => [...gs, toSwipeGame({ ...data, steamAppId: suggestion.steamAppId })]);
      setTerm("");
      setSuggestions([]);
    } finally {
      setAdding(null);
    }
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Polubione</h1>
      </div>

      <div className="relative">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Dopisz grę ręcznie…"
          className="bg-card border-border w-full rounded-xl border px-4 py-3 text-foreground"
        />
        {suggestions.length > 0 && (
          <div className="bg-popover border-border absolute top-full right-0 left-0 z-10 mt-2 max-h-80 overflow-y-auto rounded-xl border">
            {suggestions.map((s) => (
              <button
                key={s.steamAppId}
                type="button"
                onClick={() => pickGame(s)}
                disabled={adding !== null}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/5 disabled:opacity-50"
              >
                <Image src={s.tinyImage} alt="" width={64} height={32} className="h-8 w-16 rounded object-cover" />
                <span className="text-sm text-foreground">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-text-secondary py-8 text-center text-sm">Wczytuję…</p>
        ) : games.length === 0 ? (
          <p className="text-text-secondary py-8 text-center text-sm">
            Brak polubionych gier — wróć do przeglądania albo dopisz coś ręcznie powyżej.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {games.map((game) => (
              <li key={game.steamAppId} className="bg-card border-border flex items-center gap-3 rounded-xl border p-3">
                {game.coverImageUrl && (
                  <Image src={game.coverImageUrl} alt="" width={96} height={48} className="h-12 w-24 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{game.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(game.steamAppId)}
                  className="bg-secondary text-pass shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                >
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        disabled={games.length < 2}
        onClick={() => onStartVersus(games)}
        className="rounded-full py-3 text-center text-sm font-bold disabled:bg-secondary disabled:text-text-secondary bg-accent-brand text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:shadow-none"
      >
        {games.length >= 2 ? "Rozpocznij Versus →" : "Polub co najmniej 2 gry"}
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Wpięcie do `SoloHome.tsx`**

Rozszerz `Screen` w `SoloHome.tsx`:

```ts
type Screen =
  | { name: "settings" }
  | { name: "swipe"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter; genres: string[] }
  | { name: "liked" };
```

Dodaj import na górze:

```ts
import { SoloLikedScreen } from "@/components/solo/SoloLikedScreen";
import type { SwipeGame } from "@/lib/types";
```

Zamień `onViewLiked={() => {}}` (dodane w Task 8) na:

```tsx
        onViewLiked={() => setScreen({ name: "liked" })}
```

Dodaj nową gałąź renderowania przed `return <SoloSettingsScreen ...>`:

```tsx
  if (screen.name === "liked") {
    return (
      <SoloLikedScreen
        onBack={() => setScreen({ name: "settings" })}
        onStartVersus={(games) => {
          // Task 11 rozszerzy Screen o wariant "versus" i doda tu jego ustawienie.
          console.log("start versus", games);
        }}
      />
    );
  }
```

(Tymczasowy `console.log` -- zastępowany w Task 11, kiedy `LocalVersusScreen` będzie istniał.)

- [ ] **Step 3: Build i ręczny test**

Run: `npm run build`
Expected: bez błędów

Ręcznie: przejdź do biblioteki solo, polub 2+ gry, kliknij "❤️ N", potwierdź listę Polubionych, usuń jedną, dopisz ręcznie jedną przez wyszukiwarkę.

- [ ] **Step 4: Commit**

```bash
git add src/components/solo/SoloLikedScreen.tsx src/components/solo/SoloHome.tsx
git commit -m "feat: ekran Polubionych solo"
```

---

### Task 10: Wydziel deterministyczny tie-break jako czystą funkcję

**Files:**
- Modify: `src/lib/elimination.ts`
- Test: `src/lib/elimination.test.ts`
- Modify: `src/components/room/SwipeScreen.tsx:154-159`

**Interfaces:**
- Produces: `breakTieDeterministically(tiedForCutoff: number[], slotsAvailable: number): number[]` — konsumowane przez Task 11 (`useLocalVersus`) i istniejący `SwipeScreen.tsx`

- [ ] **Step 1: Napisz failing test**

Dodaj do `src/lib/elimination.test.ts`:

```ts
describe("breakTieDeterministically", () => {
  it("wybiera najnizsze appid do liczby dostepnych miejsc", () => {
    expect(breakTieDeterministically([30, 10, 20], 2)).toEqual([10, 20]);
  });

  it("zwraca pustą listę gdy brak dostępnych miejsc", () => {
    expect(breakTieDeterministically([10, 20], 0)).toEqual([]);
  });
});
```

Dopisz `breakTieDeterministically` do importu z `"./elimination"` na górze pliku testowego.

- [ ] **Step 2: Uruchom test, potwierdź że failuje**

Run: `npx vitest run src/lib/elimination.test.ts`
Expected: FAIL — `breakTieDeterministically is not defined`

- [ ] **Step 3: Zaimplementuj i wywołaj z `resolveRound`-sąsiedztwa**

W `src/lib/elimination.ts`, dodaj na końcu pliku:

```ts
/** Rozstrzyga remis na granicy odcięcia deterministycznie (najniższe appid) --
 * bezpieczne przy wyścigu wielu klientów w pokoju (każdy liczy to samo z tych
 * samych danych). Używane też przez lokalny Versus solo (jeden uczestnik, ale
 * ten sam kod ścieżki co pokój dla spójności).
 * TODO(kiedyś): prawdziwy rzut monetą/koło zamiast sortowania -- nienaprawiony
 * dług, zob. docs/superpowers/specs/2026-07-15-explore-liked-versus-design.md. */
export function breakTieDeterministically(tiedForCutoff: number[], slotsAvailable: number): number[] {
  return [...tiedForCutoff].sort((a, b) => a - b).slice(0, slotsAvailable);
}
```

- [ ] **Step 4: Uruchom test ponownie**

Run: `npx vitest run src/lib/elimination.test.ts`
Expected: PASS

- [ ] **Step 5: Podmień inline logikę w `SwipeScreen.tsx`**

Zamień w `src/components/room/SwipeScreen.tsx`:

```ts
    } else if (result.status === "tie-break") {
      // TODO(Faza 3+): coinflip jako tie-breaker nie jest tu podpięty (patrz
      // komentarz przy finishRound w lib/rooms.ts). Na razie deterministyczne
      // rozstrzygnięcie (najniższy appid) -- bezpieczne przy wyścigu.
      const brokenTie = [...result.tiedForCutoff].sort((a, b) => a - b).slice(0, result.slotsAvailable);
      finalSurvivors = [...result.survivors, ...brokenTie];
    }
```

na:

```ts
    } else if (result.status === "tie-break") {
      const brokenTie = breakTieDeterministically(result.tiedForCutoff, result.slotsAvailable);
      finalSurvivors = [...result.survivors, ...brokenTie];
    }
```

i dodaj `breakTieDeterministically` do importu z `"@/lib/elimination"` na górze pliku (obok `resolveRound`, `type Swipe`).

- [ ] **Step 6: Build i testy**

Run: `npm run build && npx vitest run`
Expected: wszystko zielone

- [ ] **Step 7: Commit**

```bash
git add src/lib/elimination.ts src/lib/elimination.test.ts src/components/room/SwipeScreen.tsx
git commit -m "refactor: wydziel breakTieDeterministically, reuzyj w SwipeScreen"
```

---

### Task 11: Lokalny runner Versus (solo)

**Files:**
- Create: `src/lib/useLocalVersus.ts`
- Create: `src/components/solo/LocalVersusScreen.tsx`
- Modify: `src/components/solo/SoloHome.tsx`

**Interfaces:**
- Consumes: `resolveRound`, `breakTieDeterministically` (Task 10), `WinnerScreen` (istniejący, `src/components/room/WinnerScreen.tsx`)
- Produces: `useLocalVersus(initialPool: number[])` zwraca `{ deck: number[], poolSize: number, winner: number | null, vote: (steamAppId: number, direction: SwipeDirection) => void }`

- [ ] **Step 1: Utwórz `useLocalVersus.ts`**

```ts
"use client";

import { useState } from "react";
import { resolveRound, breakTieDeterministically, type Swipe, type SwipeDirection } from "@/lib/elimination";

const SOLO_PARTICIPANT = "solo";

/** Wersja lokalna orkiestracji rund eliminacji z SwipeScreen.tsx/RoundVoting --
 * ten sam resolveRound, bez Firestore, bez wielu uczestników (jeden głos na
 * grę na rundę). Wzorem useLocalCoinflip/useLocalWheel z Fazy A2b. */
export function useLocalVersus(initialPool: number[]) {
  const [pool, setPool] = useState(initialPool);
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const [winner, setWinner] = useState<number | null>(null);

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

  const myVotes = new Set(swipes.map((s) => s.steamAppId));
  const deck = pool.filter((id) => !myVotes.has(id));

  return { deck, poolSize: pool.length, winner, vote };
}
```

(Nietestowana -- hook z Reactowym stanem, konwencja tego repo jak `useLocalCoinflip`/`useLocalWheel`; logika decyzyjna, którą testujemy, żyje w `resolveRound`/`breakTieDeterministically`, oba już pokryte testami.)

- [ ] **Step 2: Utwórz `LocalVersusScreen.tsx`**

```tsx
"use client";

import { useLocalVersus } from "@/lib/useLocalVersus";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { WinnerScreen } from "@/components/room/WinnerScreen";
import type { SwipeGame } from "@/lib/types";

/** Versus solo: bracket eliminacji na liście Polubionych, bez Firestore.
 * `games` to pełne dane (nie same appidy) -- SoloLikedScreen już je ma
 * wczytane, unikamy ponownego fetchowania /api/steam/details tutaj. */
export function LocalVersusScreen({ games, onExit }: { games: SwipeGame[]; onExit: () => void }) {
  const gameByAppId = new Map(games.map((g) => [g.steamAppId, g]));
  const { deck, poolSize, winner, vote } = useLocalVersus(games.map((g) => g.steamAppId));

  if (winner !== null) {
    return <WinnerScreen game={gameByAppId.get(winner)} />;
  }

  const currentGame = gameByAppId.get(deck[0]);
  if (!currentGame) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }

  function handleSwipe(direction: "left" | "right") {
    vote(currentGame.steamAppId, direction);
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
      <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
    </div>
  );
}
```

- [ ] **Step 3: Wpięcie do `SoloHome.tsx`**

Rozszerz `Screen`:

```ts
type Screen =
  | { name: "settings" }
  | { name: "swipe"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter; genres: string[] }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };
```

Dodaj import:

```ts
import { LocalVersusScreen } from "@/components/solo/LocalVersusScreen";
```

Zamień tymczasowy `console.log` z Task 9 na:

```tsx
        onStartVersus={(games) => setScreen({ name: "versus", games })}
```

Dodaj gałąź renderowania (przed gałęzią `"liked"`):

```tsx
  if (screen.name === "versus") {
    return <LocalVersusScreen games={screen.games} onExit={() => setScreen({ name: "liked" })} />;
  }
```

- [ ] **Step 4: Build i ręczny test end-to-end**

Run: `npm run build`
Expected: bez błędów

Ręcznie: polub 3+ gry w solo, wejdź w Polubione, "Rozpocznij Versus", przejdź pełny bracket (w tym ewentualny remis), potwierdź ekran zwycięzcy.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useLocalVersus.ts src/components/solo/LocalVersusScreen.tsx src/components/solo/SoloHome.tsx
git commit -m "feat: lokalny Versus solo (bracket eliminacji na Polubionych)"
```

---

### Task 12: Explore w pokoju (wspólna biblioteka)

**Files:**
- Create: `src/components/room/RoomExploreScreen.tsx`
- Create: `src/app/room/[code]/explore/page.tsx`

**Interfaces:**
- Consumes: `computeSharedLibrary`, `matchesMultiplayerFilter`, `matchesGenreFilter`, `GENRE_OPTIONS` (`@/lib/steamLibrary`, Task 3), `likeGame` (Task 5), `subscribeToParticipants` (istniejące)
- Produces: trasa `/room/[code]/explore`

- [ ] **Step 1: Utwórz `RoomExploreScreen.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
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
import { useParticipant } from "@/lib/useParticipant";
import type { SteamCacheEntry } from "@/lib/steam";
import type { SwipeGame } from "@/lib/types";

const MULTIPLAYER_OPTIONS: { value: MultiplayerFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "solo", label: "Jednoosobowe" },
  { value: "multi", label: "Wieloosobowe" },
];

type DetailsResponse = SteamCacheEntry & { steamAppId: number; error?: string };

function toSwipeGame(data: DetailsResponse): SwipeGame {
  return {
    steamAppId: data.steamAppId,
    title: data.name,
    coverImageUrl: data.headerImageUrl,
    tags: data.tags,
    genres: data.genres,
    reviewScorePercent: data.reviewScorePercent,
    reviewSummary: data.reviewSummary,
    shortDescription: data.shortDescription,
    developers: data.developers,
    releaseDate: data.releaseDate,
    screenshots: data.screenshots,
    trailerHlsUrl: data.trailerHlsUrl,
    trailerThumbnail: data.trailerThumbnail,
    totalReviews: data.totalReviews,
    topReviews: data.topReviews,
  };
}

/** Explore w pokoju: swipe bez eliminacji po części wspólnej bibliotek
 * uczestników. Polubienie zapisuje do rooms/{code}/liked (Task 5), pominięcie
 * po prostu przechodzi dalej -- ten sam wzorzec leniwego fetchowania co
 * SoloSwipeScreen.advance(), tylko źródło appidów to computeSharedLibrary. */
export function RoomExploreScreen({ roomCode }: { roomCode: string }) {
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

  const shared = computeSharedLibrary(participants);

  async function advance() {
    setLoadingCard(true);
    while (cursorRef.current < poolRef.current.length) {
      const steamAppId = poolRef.current[cursorRef.current];
      cursorRef.current += 1;
      try {
        const res = await fetch(`/api/steam/details?appid=${steamAppId}`);
        const data = (await res.json()) as DetailsResponse;
        if (!res.ok || data.error) continue;
        if (!matchesMultiplayerFilter(data.tags, multiplayer)) continue;
        if (!matchesGenreFilter(data.genres, genres)) continue;
        setCurrentCard(toSwipeGame({ ...data, steamAppId }));
        setLoadingCard(false);
        return;
      } catch {
        continue;
      }
    }
    setCurrentCard(null);
    setExhausted(true);
    setLoadingCard(false);
  }

  function handleStart() {
    poolRef.current = shared;
    cursorRef.current = 0;
    setExhausted(false);
    setStarted(true);
    advance();
  }

  function handleLike() {
    if (currentCard && participantId) likeGame(roomCode, currentCard.steamAppId, participantId);
    advance();
  }

  function handlePass() {
    advance();
  }

  if (!participantId) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">
        Wróć do <Link href={`/room/${roomCode}`} className="underline">lobby</Link>, żeby dołączyć do pokoju.
      </p>
    );
  }

  if (!started) {
    return (
      <main className="flex h-dvh flex-col px-[22px] pt-[18px] pb-[30px]">
        <div className="flex items-center gap-3">
          <Link
            href={`/room/${roomCode}`}
            aria-label="Wstecz"
            className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
          >
            ‹
          </Link>
          <h1 className="font-heading text-[18px] font-bold text-foreground">Eksploruj</h1>
        </div>

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
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Jaki gatunek?</p>
              <MultiToggleChip value={genres} options={GENRE_OPTIONS} onChange={setGenres} columns={2} />
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
        <Link
          href={`/room/${roomCode}/liked`}
          className="text-text-secondary mt-4 text-center text-sm underline"
        >
          Zobacz Polubione →
        </Link>
      </main>
    );
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setStarted(false)}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <Link href={`/room/${roomCode}/liked`} className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground">
          ❤️ Polubione
        </Link>
      </div>

      <div className="min-h-0 flex-1 lg:flex lg:flex-col lg:justify-center">
        {loadingCard ? (
          <p className="text-text-secondary p-6 text-center text-sm">Szukam kolejnej gry…</p>
        ) : exhausted ? (
          <p className="text-text-secondary p-6 text-center text-sm">To wszystkie gry pasujące do filtrów.</p>
        ) : currentCard ? (
          <GameDetailLayout key={currentCard.steamAppId} game={currentCard}>
            <SwipeCard
              key={currentCard.steamAppId}
              game={currentCard}
              onSwipe={(direction) => (direction === "right" ? handleLike() : handlePass())}
            />
          </GameDetailLayout>
        ) : null}
      </div>

      {!exhausted && !loadingCard && <SwipeActionButtons onPass={handlePass} onLike={handleLike} />}
    </main>
  );
}
```

- [ ] **Step 2: Trasa**

```tsx
import { RoomExploreScreen } from "@/components/room/RoomExploreScreen";

export default async function ExplorePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomExploreScreen roomCode={code} />;
}
```

- [ ] **Step 3: Build i ręczny test**

Run: `npm run build`
Expected: bez błędów

Ręcznie (2 uczestników z podpiętym Steamem w jednym pokoju): otwórz `/room/[code]/explore`, ustaw filtr, "Zacznij przeglądać", polub kilka gier, sprawdź w Firestore Console że `rooms/{code}/liked` się zapełnia.

- [ ] **Step 4: Commit**

```bash
git add src/components/room/RoomExploreScreen.tsx src/app/room/[code]/explore/page.tsx
git commit -m "feat: Explore w pokoju (wspolna biblioteka)"
```

---

### Task 13: Ekran Polubionych (pokój) + parametryzacja `AddGameForm`

**Files:**
- Modify: `src/components/room/AddGameForm.tsx`
- Create: `src/components/room/LikedScreen.tsx`
- Create: `src/app/room/[code]/liked/page.tsx`

**Interfaces:**
- Consumes: `subscribeToLiked`, `unlikeGame`, `likeGame` (Task 5)
- Produces: trasa `/room/[code]/liked`, `AddGameForm` z opcjonalnym propem `addFn`

- [ ] **Step 1: Parametryzuj `AddGameForm`**

Zmień sygnaturę i wywołanie w `src/components/room/AddGameForm.tsx`:

```tsx
import { addGameToPool } from "@/lib/rooms";

type SteamSuggestion = { steamAppId: number; name: string; tinyImage: string };

export function AddGameForm({
  roomCode,
  participantId,
  addFn = addGameToPool,
}: {
  roomCode: string;
  participantId: string;
  addFn?: (roomCode: string, steamAppId: number, participantId: string) => Promise<void>;
}) {
```

Zamień w `pickGame`:

```ts
      await addGameToPool(roomCode, suggestion.steamAppId, participantId);
```

na:

```ts
      await addFn(roomCode, suggestion.steamAppId, participantId);
```

- [ ] **Step 2: Utwórz `LikedScreen.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { subscribeToLiked, unlikeGame, likeGame, type LikedGame } from "@/lib/rooms";
import { AddGameForm } from "@/components/room/AddGameForm";
import { useParticipant } from "@/lib/useParticipant";
import { cn } from "@/lib/utils";

export function LikedScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [games, setGames] = useState<LikedGame[]>([]);

  useEffect(() => subscribeToLiked(roomCode, setGames), [roomCode]);

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
          href={`/room/${roomCode}/explore`}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </Link>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Polubione</h1>
      </div>

      <AddGameForm roomCode={roomCode} participantId={participantId} addFn={(rc, id, pid) => likeGame(rc, id, pid)} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {games.length === 0 ? (
          <p className="text-text-secondary py-8 text-center text-sm">
            Brak polubionych gier — wróć do Explore albo dopisz coś ręcznie powyżej.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {games.map((game) => (
              <li key={game.steamAppId} className="bg-card border-border flex items-center gap-3 rounded-xl border p-3">
                {game.coverImageUrl && (
                  <Image src={game.coverImageUrl} alt="" width={96} height={48} className="h-12 w-24 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{game.title}</p>
                  <p className="text-text-secondary text-xs">{game.likedBy.length} polubień</p>
                </div>
                <button
                  type="button"
                  onClick={() => unlikeGame(roomCode, game.steamAppId, participantId)}
                  className="bg-secondary text-pass shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                >
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
    </main>
  );
}
```

- [ ] **Step 3: Trasa**

```tsx
import { LikedScreen } from "@/components/room/LikedScreen";

export default async function LikedPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <LikedScreen roomCode={code} />;
}
```

- [ ] **Step 4: Build i ręczny test**

Run: `npm run build`
Expected: bez błędów (link do `/room/[code]/versus` jeszcze nie istnieje jako trasa -- to Task 14, `Link` samo w sobie się skompiluje)

- [ ] **Step 5: Commit**

```bash
git add src/components/room/AddGameForm.tsx src/components/room/LikedScreen.tsx src/app/room/[code]/liked/page.tsx
git commit -m "feat: ekran Polubionych w pokoju + parametryzacja AddGameForm"
```

---

### Task 14: Versus w pokoju -- wydzielenie generycznego silnika rund

**Files:**
- Create: `src/components/room/EliminationRound.tsx`
- Modify: `src/components/room/SwipeScreen.tsx`
- Create: `src/app/room/[code]/versus/page.tsx`

**Interfaces:**
- Consumes: `startRound`, `getActiveRound`, `subscribeToEliminationRounds`, `subscribeToRound`, `subscribeToRoundSwipes`, `castSwipe`, `finishRound` (istniejące w `rooms.ts`), `resolveRound`, `breakTieDeterministically` (Task 10)
- Produces: `EliminationRound` przyjmuje `roomCode`, `initialPool: number[]`, `gameByAppId: Map<number, SwipeGame>`, `emptyMessage: string` -- konsumowane przez cienkie wrappery `SwipeScreen` (istniejąca trasa, źródło: `games`) i nową trasę `/room/[code]/versus` (źródło: `liked`)

- [ ] **Step 1: Utwórz `EliminationRound.tsx` -- generyczna wersja dzisiejszego `SwipeScreen.tsx`**

Skopiuj CAŁĄ zawartość `src/components/room/SwipeScreen.tsx` do nowego pliku `src/components/room/EliminationRound.tsx` i zmodyfikuj:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { WinnerScreen } from "@/components/room/WinnerScreen";
import { useParticipant } from "@/lib/useParticipant";
import {
  subscribeToParticipants,
  getActiveRound,
  startRound,
  subscribeToRound,
  subscribeToRoundSwipes,
  subscribeToEliminationRounds,
  castSwipe,
  finishRound,
  type Participant,
  type RoundDoc,
} from "@/lib/rooms";
import { resolveRound, breakTieDeterministically, type Swipe } from "@/lib/elimination";
import type { SwipeGame } from "@/lib/types";

/** Silnik rund eliminacji (swipe + orkiestracja), wydzielony z dawnego
 * SwipeScreen.tsx żeby dało się go uruchomić na dowolnej puli -- dzisiejsza
 * ręczna pula (games, status=active) i Versus (liked) to teraz dwa cienkie
 * wrappery nad tym samym silnikiem. Mechanika (odcinanie najsłabszej połowy,
 * remisy) liczona w lib/elimination.ts. Rundy scope'owane przez sessionId,
 * jak dawniej -- szczegóły w komentarzach RoundVoting poniżej. */
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
  const { participantId } = useParticipant(roomCode);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [session, setSession] = useState<{ sessionId: string; roundNumber: number } | null>(null);
  const bootstrapping = useRef(false);

  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);

  useEffect(() => {
    if (session || bootstrapping.current) return;
    if (initialPool.length < 2) return;
    bootstrapping.current = true;
    getActiveRound(roomCode).then((existing) => {
      if (existing) {
        setSession({ sessionId: existing.sessionId, roundNumber: existing.roundNumber });
      } else {
        const sessionId = crypto.randomUUID();
        startRound(roomCode, sessionId, 1, initialPool);
        setSession({ sessionId, roundNumber: 1 });
      }
      bootstrapping.current = false;
    });
  }, [roomCode, initialPool, session]);

  useEffect(() => {
    if (!session || session.roundNumber !== 1) return;
    return subscribeToEliminationRounds(roomCode, (rounds) => {
      const voting = rounds.filter((r) => r.status === "voting" && r.roundNumber === 1);
      if (voting.length === 0) return;
      const canonical = [...voting].sort((a, b) => a.sessionId.localeCompare(b.sessionId))[0].sessionId;
      if (canonical !== session.sessionId) {
        setSession({ sessionId: canonical, roundNumber: 1 });
      }
    });
  }, [roomCode, session]);

  if (!participantId) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dołącz do pokoju w lobby.</p>;
  }
  if (initialPool.length < 2) {
    return <p className="text-text-secondary p-6 text-center text-sm">{emptyMessage}</p>;
  }
  if (!session) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }

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
  gameByAppId: Map<number, SwipeGame>;
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
      const brokenTie = breakTieDeterministically(result.tiedForCutoff, result.slotsAvailable);
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
      <main className="min-h-0 flex-1 px-[22px] pb-[18px] lg:flex lg:flex-col lg:justify-center">
        <GameDetailLayout key={currentGame.steamAppId} game={currentGame}>
          <SwipeCard key={currentGame.steamAppId} game={currentGame} onSwipe={handleSwipe} />
        </GameDetailLayout>
      </main>
      <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
    </div>
  );
}
```

- [ ] **Step 2: Zamień `SwipeScreen.tsx` na cienki wrapper**

Zastąp całą zawartość `src/components/room/SwipeScreen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { EliminationRound } from "@/components/room/EliminationRound";
import { subscribeToGamePool, type PoolGame } from "@/lib/rooms";

/** Dzisiejsza pula (games, status=active) wpięta w generyczny silnik rund.
 * Sam silnik: EliminationRound.tsx. */
export function SwipeScreen({ roomCode }: { roomCode: string }) {
  const [poolGames, setPoolGames] = useState<PoolGame[]>([]);

  useEffect(() => subscribeToGamePool(roomCode, setPoolGames), [roomCode]);

  const activeGames = poolGames.filter((g) => g.status === "active");
  const gameByAppId = new Map(poolGames.map((g) => [g.steamAppId, g]));

  return (
    <EliminationRound
      roomCode={roomCode}
      initialPool={activeGames.map((g) => g.steamAppId)}
      gameByAppId={gameByAppId}
      emptyMessage="Dodaj co najmniej 2 gry w puli."
    />
  );
}
```

- [ ] **Step 3: Utwórz `VersusScreen.tsx` -- drugi wrapper, źródło: `liked`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { EliminationRound } from "@/components/room/EliminationRound";
import { subscribeToLiked, type LikedGame } from "@/lib/rooms";

export function VersusScreen({ roomCode }: { roomCode: string }) {
  const [liked, setLiked] = useState<LikedGame[]>([]);

  useEffect(() => subscribeToLiked(roomCode, setLiked), [roomCode]);

  const gameByAppId = new Map(liked.map((g) => [g.steamAppId, g]));

  return (
    <EliminationRound
      roomCode={roomCode}
      initialPool={liked.map((g) => g.steamAppId)}
      gameByAppId={gameByAppId}
      emptyMessage="Polub co najmniej 2 gry w Explore, zanim zaczniesz Versus."
    />
  );
}
```

Zapisz jako `src/components/room/VersusScreen.tsx`.

- [ ] **Step 4: Trasa `/room/[code]/versus`**

```tsx
import { VersusScreen } from "@/components/room/VersusScreen";

export default async function VersusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <VersusScreen roomCode={code} />;
}
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: bez błędów

- [ ] **Step 6: Ręczny test regresji + nowej ścieżki**

Ręcznie: potwierdź że stara ścieżka (`/room/[code]/pool` → "Zacznij głosowanie" → `/room/[code]/swipe`) nadal działa identycznie jak przed refaktorem (pełny przebieg rund + zwycięzca). Potem: z listy Polubionych (Task 13) kliknij "Rozpocznij Versus →", potwierdź że `/room/[code]/versus` startuje rundę na polubionych grach, przechodzi rundy, pokazuje zwycięzcę.

**Znana, nienaprawiana teraz luka**: jeśli w tym samym pokoju ktoś równolegle uruchomi zwykłą pulę (`/swipe`) i Versus (`/versus`), oba współdzielą tę samą kolekcję `eliminationRounds` i mogą się wzajemnie pomylić (`getActiveRound` nie rozróżnia źródła). W praktyce (2-4 znajomych, jedna aktywność na raz) to nie występuje -- udokumentowane jako świadome uproszczenie, nie do naprawienia w tym planie.

- [ ] **Step 7: Commit**

```bash
git add src/components/room/EliminationRound.tsx src/components/room/SwipeScreen.tsx src/components/room/VersusScreen.tsx src/app/room/[code]/versus/page.tsx
git commit -m "refactor: wydziel EliminationRound, dodaj Versus (pokoj) na Polubionych"
```

---

### Task 15: Wejście — Explore jako domyślna ścieżka

**Files:**
- Modify: `src/components/room/RoomLobby.tsx`

**Interfaces:**
- Consumes: brak nowych (tylko routing)

- [ ] **Step 1: Zamień kolejność/styl linków w `RoomLobby.tsx`**

Zamień blok:

```tsx
        <Link
          href={`/room/${roomCode}/pool`}
          className="bg-accent-brand rounded-full py-3 text-center text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
        >
          Pula gier →
        </Link>
        <Link
          href={`/room/${roomCode}/history`}
          className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
        >
          Historia
        </Link>
```

na:

```tsx
        <Link
          href={`/room/${roomCode}/explore`}
          className="bg-accent-brand rounded-full py-3 text-center text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
        >
          Eksploruj gry →
        </Link>
        <Link
          href={`/room/${roomCode}/pool`}
          className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
        >
          Ręczna pula gier →
        </Link>
        <Link
          href={`/room/${roomCode}/history`}
          className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
        >
          Historia
        </Link>
```

- [ ] **Step 2: Build i ręczny test**

Run: `npm run build`
Expected: bez błędów

Ręcznie: wejdź do lobby pokoju, potwierdź że "Eksploruj gry →" jest teraz głównym (kolorowym) przyciskiem, a "Ręczna pula gier →" nadal prowadzi do niezmienionego dzisiejszego ekranu puli.

- [ ] **Step 3: Commit**

```bash
git add src/components/room/RoomLobby.tsx
git commit -m "feat: Eksploruj jako domyslne wejscie z lobby pokoju"
```

---

### Task 16: Pełna ręczna weryfikacja end-to-end

- [ ] **Step 1: `npm run build && npx vitest run`**

Expected: build bez błędów, wszystkie testy zielone (stare + nowe z Tasków 1, 3, 6, 10).

- [ ] **Step 2: Solo, pełna ścieżka**

Wczytaj bibliotekę solo z filtrem gatunku, polub 3+ gry (przycisk ❤️ pokazuje rosnący licznik), wejdź w Polubione, usuń jedną, dopisz jedną ręcznie, "Rozpocznij Versus", przejdź pełny bracket (celowo doprowadź do remisu, jeśli to możliwe z 3 grami — sprawdź że deterministyczne rozstrzygnięcie działa), potwierdź ekran zwycięzcy z konfetti.

- [ ] **Step 3: Pokój, pełna ścieżka (2 symulowani uczestnicy)**

Stwórz pokój, dołącz drugim "uczestnikiem" (druga karta przeglądarki/incognito), oboje podają profile Steam z częścią wspólną. Wejdź w "Eksploruj gry →", ustaw filtr, przeglądaj i lubcie NIEZALEŻNIE różne gry (potwierdź że polubienia jednego uczestnika nie blokują drugiego). Wejdź w Polubione — potwierdź że widać unię polubień obu ("N polubień" per gra). "Rozpocznij Versus →" — przejdź pełny bracket z obydwoma symulowanymi uczestnikami głosującymi, potwierdź zwycięzcę.

- [ ] **Step 4: Regresja starej ścieżki**

W tym samym pokoju: `/room/[code]/pool`, ręcznie dodaj 2 gry po tytule, "Zacznij głosowanie →", potwierdź że stara eliminacja nadal działa identycznie jak przed refaktorem `SwipeScreen.tsx`.

- [ ] **Step 5: Konsola bez błędów**

Sprawdź DevTools na każdym z powyższych kroków — zero błędów JS, zero `PERMISSION_DENIED` z Firestore.

- [ ] **Step 6: Finalny przegląd całej gałęzi, merge, deploy**

Jak w poprzednich fazach: przegląd wszystkich commitów tego planu razem (nie tylko task po tasku), `git push`, potwierdzenie auto-deploy Vercel `Ready`.

## Self-Review Checklist

1. **Pokrycie spec sekcji**: model danych (Task 1-2, 5-6), filtr gatunku (Task 3-4, 7-8, 12), Explore (Task 7, 12), Polubione+start Versus (Task 9, 13), Versus pokój+solo (Task 10-11, 14), wejście (Task 15). Sekcja 2c (katalog Steam) świadomie POZA tym planem — osobny, następny plan.
2. **Brak placeholderów**: każdy krok ma pełny kod. Jedyne odłożone decyzje (`liked` doc nie kasowany przy pustym `likedBy`, brak realnego coinflip w tie-breaku) są jawnie nazwane jako świadome uproszczenia, nie luki.
3. **Spójność typów**: `LikedGame = SwipeGame & { likedBy: string[] }` (Task 5) użyte identycznie w `LikedScreen` (Task 13) i `VersusScreen` (Task 14). `genres: string[]` (Task 1-2) użyte identycznie w `matchesGenreFilter` (Task 3), `SoloSettingsScreen`/`RoomExploreScreen` (Task 8, 12). `breakTieDeterministically` (Task 10) sygnatura identyczna w `useLocalVersus` (Task 11) i `EliminationRound` (Task 14).
