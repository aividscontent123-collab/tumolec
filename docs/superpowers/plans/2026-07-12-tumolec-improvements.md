# Tumolec — cztery usprawnienia: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cztery niezależne usprawnienia PWA Tumolec: (1) naprawa niewidocznych live-update Firestore między urządzeniami, (2) lepsza jakość obrazka na karcie swipe, (3) globalna strona paczek niezależna od pokoju, (4) redesign ekranów mini-gier na główny fokus wizualny.

**Architecture:** Każda funkcja jest samodzielna i budowana na osobnym branchu feature w osobnym worktree. Czysta logika (URL portretu Steam) żyje w `src/lib/*.ts` z kolokowanym testem Vitest. Zero nakładania się plików między branchami — patrz tabela na końcu. Żaden branch nie dotyka `firestore.rules` ani `src/lib/rooms.ts`.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion, Firebase Firestore (`tumolec-d67d9`, plan Spark), Matter.js (Plinko). Vitest do czystej logiki. Brak nowych zależności.

## Global Constraints

Te reguły obowiązują w KAŻDYM zadaniu:

- **To NIE jest znany ci Next.js.** Przed pisaniem jakiegokolwiek kodu Next (routing, `next/image`, layout) przeczytaj odpowiedni przewodnik w `node_modules/next/dist/docs/` (patrz `AGENTS.md` w root). API/konwencje mogą różnić się od twoich danych treningowych.
- **Firebase API zweryfikuj u źródła.** Dla Feature 1 potwierdź dokładną nazwę opcji (`experimentalAutoDetectLongPolling`) i sygnaturę `initializeFirestore` w aktualnych docach Firebase JS SDK (context7 / `firebase/firestore`), nie polegaj wyłącznie na danych treningowych.
- **Nigdy nie commituj na `master`.** `master` auto-deployuje się na produkcję (`tumolec.vercel.app`) przy każdym pushu. Pracuj na branchu feature podanym w nagłówku grupy, w osobnym worktree.
- **Git na tej maszynie (Windows) może nie być na PATH basha.** Jeśli bash zgłosi `git: command not found`, uruchamiaj polecenia git przez PowerShell.
- **BEZ trailera `Co-Authored-By`** w commitach (zgodnie z `CLAUDE.md` projektu — `attribution.commit` nie jest ustawione). Zignoruj domyślną sugestię narzędzia Bash.
- **Alias importu:** `@/` → `src/` (zdefiniowany w `tsconfig.json` i `vitest.config.ts`).
- **Testy:** kolokowane `*.test.ts` obok testowanego pliku, `describe`/`it` z Vitest, środowisko `node`. Uruchamianie: `npx vitest run`.
- **Copy UI po polsku.** Etykiety przycisków, komunikaty i teksty commitów po polsku (spójnie z resztą repo).
- **Bar weryfikacji na koniec każdej grupy:** `npm run build` (musi przejść) + `npx vitest run` (wszystkie testy zielone). Wizualna weryfikacja przez Playwright MCP jest opcjonalnym „nice-to-have", jeśli dostępna — nie zakładaj, że jest.

### Pliki dotykane przez wiele grup

**Brak.** W odróżnieniu od Fazy 5, cztery branche dotykają rozłącznych zbiorów plików (tabela na końcu). Nie ma konfliktów merge do przewidzenia. Mergować w dowolnej kolejności.

---

## Feature 1: Naprawa live-update Firestore (branch `fix/firestore-longpolling`)

**Cel:** naprawić bug, w którym dołączenie znajomego (np. przez QR z telefonu) nie jest widoczne w czasie rzeczywistym u innego uczestnika (typowo desktop). Root cause: domyślny transport streaming Firestore bywa blokowany przez sieć/proxy/ad-blocker; pierwszy snapshot dochodzi, kolejne pushe nie. Naprawa: włączyć auto-detekcję long-pollingu.

### Task 1.1: Włączenie `experimentalAutoDetectLongPolling` w init Firestore

**Files:**
- Modify: `src/lib/firebase.ts`

**Interfaces:**
- Produces: `db` (bez zmiany sygnatury — dalej `Firestore`, zmienia się tylko transport). Nic dla innych zadań.

- [ ] **Step 1: Utwórz worktree/branch**

```bash
git checkout master && git pull && git checkout -b fix/firestore-longpolling
```

- [ ] **Step 2: Potwierdź API Firebase**

Sprawdź w aktualnych docach Firebase JS SDK (context7 `firebase/firestore` albo `node_modules/firebase`), że `initializeFirestore(app, settings)` istnieje i przyjmuje `{ experimentalAutoDetectLongPolling: true }`. To ustalona część SDK v9+, ale weryfikacja jest tania i wymagana regułą globalną.

- [ ] **Step 3: Zamień init z bezpiecznym idiomem singletona**

W `src/lib/firebase.ts` zamień:

```tsx
import { getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
```
na:
```tsx
import { getApps, initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
```

Zamień dwie ostatnie linie:

```tsx
const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const db = getFirestore(app);
```
na:
```tsx
const existingApp = getApps()[0];
const app = existingApp ?? initializeApp(firebaseConfig);

// experimentalAutoDetectLongPolling: streaming WebChannel bywa buforowany przez
// sieci desktopowe/proxy/ad-blockery -- wtedy pierwszy snapshot dochodzi, ale
// kolejne pushe live już nie (przyczyna: znajomy dołącza, desktop go nie widzi).
// Auto-detect przełącza na long-polling tylko gdy streaming zawiedzie -- backward
// compatible. initializeFirestore rzuca przy drugim wywołaniu na tym samym app
// (HMR w devie), więc inicjalizujemy tylko dla świeżo tworzonego app.
export const db = existingApp
  ? getFirestore(app)
  : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
```

- [ ] **Step 4: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi bez błędów TypeScript.

- [ ] **Step 5: Weryfikacja ręczna (WYMAGANA — bug sieciowy, brak testu jednostkowego)**

- Uruchom `npm run dev`. Otwórz ten sam pokój w dwóch niezależnych sesjach przeglądarki (dwa okna/profil incognito, ideal­nie drugie urządzenie).
- W jednej sesji stwórz pokój; w drugiej dołącz. Potwierdź, że lista uczestników aktualizuje się na OBU bez ręcznego odświeżania.
- Potwierdź, że flaga jest aktywna: DevTools → Network → filtr `firestore.googleapis.com`. Gdy auto-detect wybierze long-polling, ruch idzie jako powtarzane POST-y do `/channel` zamiast jednego wiszącego streamu.
- (Idealnie) odtwórz warunek blokujący streaming — np. włącz agresywny ad-blocker/rozszerzenie prywatności na desktopie — i potwierdź, że live-update dalej działa. To jest właściwy test „before/after" tego buga.

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebase.ts
git commit -m "fix: auto-detekcja long-pollingu Firestore (naprawa niewidocznych live-update)"
```

### Task 1.2: Weryfikacja grupy Feature 1

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: zielony. (Brak testów Vitest w tej grupie — to zmiana transportu, nie logiki.)

---

## Feature 2: Jakość obrazka na karcie swipe (branch `feat/swipe-image-quality`)

**Cel:** zamienić rozmyty poziomy `header.jpg` (460×215) na karcie swipe na natywnie pionowy `library_600x900_2x.jpg` (1200×1800) ze Steam CDN, z fallbackiem do poziomego headera, gdy pionowy asset nie istnieje (404). Zero zmian danych/`firestore.rules`/`next.config.ts`.

### Task 2.1: Czysta funkcja `steamLibraryPortraitUrl` (TDD)

**Files:**
- Create: `src/lib/steamImages.ts`
- Test: `src/lib/steamImages.test.ts`

**Interfaces:**
- Produces (używane przez Task 2.2): `steamLibraryPortraitUrl(steamAppId: number): string`

- [ ] **Step 1: Utwórz worktree/branch**

```bash
git checkout master && git pull && git checkout -b feat/swipe-image-quality
```

- [ ] **Step 2: Napisz failing test**

Utwórz `src/lib/steamImages.test.ts`:

```tsx
import { describe, expect, it } from "vitest";
import { steamLibraryPortraitUrl } from "./steamImages";

describe("steamLibraryPortraitUrl", () => {
  // Blokuje regres formatu ścieżki CDN: zły URL = 404 na każdym obrazku =
  // cicha degradacja do fallbacku, "nic się nie zmienia". Ten asert to łapie.
  it("builds the portrait library asset URL for the appid", () => {
    expect(steamLibraryPortraitUrl(570)).toBe(
      "https://cdn.akamai.steamstatic.com/steam/apps/570/library_600x900_2x.jpg",
    );
  });
});
```

- [ ] **Step 3: Uruchom test — musi FAIL**

Run: `npx vitest run src/lib/steamImages.test.ts`
Expected: FAIL — brak modułu `./steamImages` / `steamLibraryPortraitUrl is not a function`.

- [ ] **Step 4: Zaimplementuj**

Utwórz `src/lib/steamImages.ts`:

```tsx
/** URL-e assetów graficznych Steam liczone z appid (bez wywołań sieciowych/cache).
 * Host cdn.akamai.steamstatic.com jest już dozwolony w next.config.ts remotePatterns. */

/** Natywnie pionowy asset "library" (1200×1800) — pasuje do wysokiej karty swipe
 * bez rozciągania poziomego header.jpg. Nie każdy appid go ma; wołający musi
 * obsłużyć 404 fallbackiem do poziomego headera (patrz SwipeCard). */
export function steamLibraryPortraitUrl(steamAppId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/library_600x900_2x.jpg`;
}
```

- [ ] **Step 5: Uruchom test — musi PASS**

Run: `npx vitest run src/lib/steamImages.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/steamImages.ts src/lib/steamImages.test.ts
git commit -m "feat: steamLibraryPortraitUrl - pionowy asset karty swipe"
```

### Task 2.2: Użycie portretu w SwipeCard z fallbackiem na 404

**Files:**
- Modify: `src/components/swipe/SwipeCard.tsx`

**Interfaces:**
- Consumes: `steamLibraryPortraitUrl` (Task 2.1); istniejące `game.steamAppId`, `game.coverImageUrl`.
- Produces: nic dla innych zadań.

- [ ] **Step 1: Dodaj import i stan źródła obrazka**

W `src/components/swipe/SwipeCard.tsx`:

Dodaj `useState` do importu React (obecnie plik nie importuje React hooków — dodaj na górze, po `"use client";`):

```tsx
import { useState } from "react";
```

Dodaj import helpera (obok istniejących importów z `@/lib`):

```tsx
import { steamLibraryPortraitUrl } from "@/lib/steamImages";
```

- [ ] **Step 2: Wylicz źródło portretu z fallbackiem**

Wewnątrz komponentu `SwipeCard`, po istniejących `useMotionValue`/`useTransform` (przed `useDrag`), dodaj:

```tsx
  // Start od pionowego assetu (ostry na wysokiej karcie); gdy 404 (nie każdy
  // appid ma library art), onError przełącza na poziomy header (coverImageUrl).
  // Trzeci poziom (brak obrazka w ogóle) obsługuje istniejący placeholder niżej.
  const [imgSrc, setImgSrc] = useState<string | undefined>(
    game.coverImageUrl ? steamLibraryPortraitUrl(game.steamAppId) : undefined,
  );
```

- [ ] **Step 3: Podłącz `imgSrc` + `onError` do `<Image>`**

W bloku renderującym obrazek (`SwipeCard.tsx:66-74`), zamień `src={game.coverImageUrl}` na `src={imgSrc}` i dodaj `onError`. Warunek renderowania obrazka vs placeholder zostaje na `game.coverImageUrl` (gdy w ogóle brak headera, `imgSrc` też jest `undefined` i idziemy w placeholder). Docelowo:

```tsx
        {game.coverImageUrl && imgSrc ? (
          <Image
            src={imgSrc}
            alt={game.title}
            fill
            className="pointer-events-none object-cover"
            sizes="(max-width: 500px) 100vw, 500px"
            draggable={false}
            onError={() => {
              // Portret nie istnieje -> spadamy na poziomy header raz.
              if (imgSrc !== game.coverImageUrl) setImgSrc(game.coverImageUrl);
            }}
          />
        ) : (
```

Reszta bloku (placeholder w `else`) bez zmian.

- [ ] **Step 4: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi bez błędów.

- [ ] **Step 5: (Opcjonalnie) weryfikacja wizualna**

Jeśli Playwright MCP dostępny: otwórz `/room/<kod>/swipe` z ≥2 grami w puli, potwierdź, że karta pokazuje ostry pionowy obrazek. Dla gry bez library art (rzadkie) potwierdź, że spada na poziomy header, a nie na zepsuty obrazek. Jeśli niedostępny — pomiń.

- [ ] **Step 6: Commit**

```bash
git add src/components/swipe/SwipeCard.tsx
git commit -m "feat: pionowy obrazek library na karcie swipe z fallbackiem na header"
```

### Task 2.3: Weryfikacja grupy Feature 2

- [ ] **Step 1: Build + testy**

Run: `npm run build && npx vitest run`
Expected: build zielony, wszystkie testy przechodzą (w tym `steamLibraryPortraitUrl`).

---

## Feature 3: Globalna strona paczek (branch `feat/global-packages-page`)

**Cel:** paczki gier osiągalne niezależnie od pokoju. Model danych JEST już globalny (`packages` top-level, `subscribeToPackages` niescope'owane) — luka jest tylko w UI. Dodajemy read-only stronę `/packages` (lista paczek: nazwa + liczba gier) z linkiem ze strony głównej. Zero zmian danych/`firestore.rules`/`rooms.ts`.

> **Rozwiązana niejednoznaczność (flag dla team-lead):** strona globalna jest READ-ONLY. Tworzenie paczki wymaga aktywnej puli pokoju, a wczytanie — docelowego pokoju; oba z natury dzieją się w pokoju i zostają w `PackageControls` bez zmian. Strona globalna pełni rolę „zawsze dostępnej listy". Dzięki temu nie dotyka `rooms.ts` (używa istniejącego `subscribeToPackages` i pól, które `GamePackage` już ma) i nie koliduje z żadnym innym branchem.

### Task 3.1: Strona `/packages` z listą paczek

**Files:**
- Create: `src/app/packages/page.tsx`

**Interfaces:**
- Consumes: istniejące `subscribeToPackages`, `GamePackage` z `@/lib/rooms`.
- Produces: nic dla innych zadań.

- [ ] **Step 1: Utwórz worktree/branch**

```bash
git checkout master && git pull && git checkout -b feat/global-packages-page
```

- [ ] **Step 2: Sprawdź konwencję App Router**

Potwierdź w `node_modules/next/dist/docs/` konwencję strony w App Router (Next 16). Wzór do naśladowania w repo: istniejące strony pokoju (np. `src/app/room/[code]/pool/page.tsx`) i strona główna `src/app/page.tsx` (komponent kliencki `"use client"`, bo używa subskrypcji Firestore w efekcie).

- [ ] **Step 3: Utwórz stronę**

Utwórz `src/app/packages/page.tsx` (komponent kliencki — subskrypcja realtime). Wzoruj się stylem na `GamePoolScreen`/`HistoryScreen` (nagłówek z linkiem wstecz do `/`, lista kart `bg-card border-border`):

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subscribeToPackages, type GamePackage } from "@/lib/rooms";

export default function PackagesPage() {
  const [packages, setPackages] = useState<GamePackage[]>([]);

  useEffect(() => subscribeToPackages(setPackages), []);

  return (
    <main className="flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[30px]">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </Link>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Paczki gier</h1>
      </div>

      <p className="text-text-secondary text-xs">
        Zapisane paczki są wspólne dla wszystkich pokoi. Dodasz je do pokoju z ekranu puli.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {packages.length === 0 ? (
          <p className="text-text-secondary py-8 text-center text-sm">
            Brak zapisanych paczek. Zapisz pierwszą z ekranu puli w pokoju.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {packages.map((pkg) => (
              <li
                key={pkg.id}
                className="bg-card border-border flex items-center justify-between rounded-xl border p-4 text-sm text-foreground"
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{pkg.name}</span>
                <span className="text-text-secondary shrink-0 text-xs">
                  {pkg.gameCount} {pkg.gameCount === 1 ? "gra" : "gier"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
```

> Uwaga: jeśli `GamePackage` nie eksportuje `gameCount`/`name`/`id`, sprawdź jego kształt w `src/lib/rooms.ts` i dostosuj odczyt (Faza 5 zdefiniowała `{ id, name, gameCount, gameIds }`). NIE modyfikuj `rooms.ts`.

- [ ] **Step 4: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi.

- [ ] **Step 5: Commit**

```bash
git add src/app/packages/page.tsx
git commit -m "feat: globalna strona /packages z listą paczek"
```

### Task 3.2: Link do `/packages` ze strony głównej

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `next/link`.
- Produces: nic dla innych zadań.

- [ ] **Step 1: Dodaj link pod formularzem**

W `src/app/page.tsx` dodaj import (obok istniejących):

```tsx
import Link from "next/link";
```

Pod zamykającym `</form>` (po `page.tsx:117`), wewnątrz `<div className="w-full max-w-sm">`, dodaj link:

```tsx
        <Link
          href="/packages"
          className="text-text-secondary mt-6 block text-center text-sm underline"
        >
          Zapisane paczki gier
        </Link>
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: build przechodzi.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: link do globalnych paczek na stronie głównej"
```

### Task 3.3: Weryfikacja grupy Feature 3

- [ ] **Step 1: Build + testy**

Run: `npm run build && npx vitest run`
Expected: build zielony, testy przechodzą (bez nowych testów — brak nowej czystej logiki).

- [ ] **Step 2: (Opcjonalnie) weryfikacja wizualna**

Jeśli Playwright MCP dostępny: z home kliknij „Zapisane paczki gier", potwierdź listę (lub pusty stan) bez potrzeby wchodzenia do pokoju. Potwierdź, że istniejący flow zapisu/wczytania paczki w pokoju (`/room/<kod>/pool`) dalej działa. Jeśli niedostępny — pomiń.

---

## Feature 4: Redesign ekranów mini-gier (branch `feat/minigame-screen-redesign`)

**Cel:** ekrany Koło/Rzut monetą/Plinko jako główny fokus wizualny — responsywny, większy wizual gry i większe kontrolki wyboru. Zmiana czysto prezentacyjna, zero danych/`firestore.rules`.

> **Ograniczenie (flag dla team-lead):** wpisy Koła to WOLNY TEKST (`addWheelEntry`, `entries: string[]`), nie gry — miniatura jest dla nich niemożliwa. Wzorzec miniatury (adaptacja `GamePoolList`) stosujemy TYLKO do wierszy Plinko (gry z puli, mają `coverImageUrl`). Koło: powiększone wiersze bez miniatur. Coinflip: binarny, pas dotyczy tylko przycisku flip.

### Task 4.1: Responsywny `WheelCanvas`

**Files:**
- Modify: `src/components/wheel/WheelCanvas.tsx`

**Interfaces:**
- Produces: nic dla innych zadań (zmiana wewnętrzna komponentu).

- [ ] **Step 1: Utwórz worktree/branch**

```bash
git checkout master && git pull && git checkout -b feat/minigame-screen-redesign
```

- [ ] **Step 2: Skaluj SVG przez viewBox zamiast sztywnego `SIZE`**

W `src/components/wheel/WheelCanvas.tsx` matematyka (`polarToCartesian`, `wedgePath`, `SIZE`/`CENTER`/`RADIUS`) zostaje jako wewnętrzna przestrzeń współrzędnych viewBox — NIE zmieniaj obliczeń. Zmień tylko renderowanie, żeby SVG wypełniał responsywny kontener:

- Zamień zewnętrzny `<div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>` na kontener z responsywną szerokością i kwadratowym aspektem:

```tsx
    <div
      className="relative mx-auto aspect-square w-full"
      style={{ maxWidth: "min(88vw, 380px)" }}
    >
```

- W `<motion.svg>` zamień `width={SIZE} height={SIZE}` na `width="100%" height="100%"` (viewBox `0 0 ${SIZE} ${SIZE}` zostaje — to on mapuje wewnętrzne współrzędne na rozmiar kontenera). Wskaźnik-trójkąt (`-top-[6px]`, bordery px) zostaje — jego drobny fixed offset jest akceptowalny.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: przechodzi.

- [ ] **Step 4: Commit**

```bash
git add src/components/wheel/WheelCanvas.tsx
git commit -m "feat: responsywne koło fortuny (skalowanie przez viewBox)"
```

### Task 4.2: Powiększone wiersze i przycisk w `WheelControls`

**Files:**
- Modify: `src/components/wheel/WheelControls.tsx`

- [ ] **Step 1: Powiększ wiersze wpisów i przycisk „Losuj"**

W `src/components/wheel/WheelControls.tsx` (wpisy to tekst — BEZ miniatur):
- Wiersze `<li>` (`WheelControls.tsx:39-53`): zwiększ padding/typografię, np. `px-4 py-2 text-sm` → `px-5 py-3.5 text-base`; powiększ przycisk `✕` (dodaj obszar klikalny, np. `h-8 w-8 flex items-center justify-center text-lg`, zachowaj `aria-label`).
- Przycisk „Losuj" (`WheelControls.tsx:57-65`): zwiększ z `py-3 text-sm` na `py-4 text-base` (spójnie z pozostałymi ekranami mini-gier).

Zachowaj istniejącą logikę (`handleAdd`, `disabled`, `triggerWheelSpin`) bez zmian — to wyłącznie zmiana klas.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: przechodzi.

- [ ] **Step 3: Commit**

```bash
git add src/components/wheel/WheelControls.tsx
git commit -m "feat: powiększone wiersze wpisów i przycisk koła fortuny"
```

### Task 4.3: Responsywny `PlinkoBoard`

**Files:**
- Modify: `src/components/plinko/PlinkoBoard.tsx`

**Interfaces:**
- Produces: nic dla innych zadań. `onSettled(slot)` i logika fizyki bez zmiany.

- [ ] **Step 1: Dopasuj rozmiar canvasa do szerokości viewportu**

`PlinkoBoard` renderuje canvas Matter.js o stałej `WIDTH = 320`. Ponytail: zostaw wewnętrzną przestrzeń współrzędnych fizyki (320) — przelicznik pegów zależy od `WIDTH`/`PEG_GAP` — i CSS-owo dopasuj rozmiar wyświetlania kontenera do dostępnej szerokości. Zmień kontener zwrotny:

```tsx
  return (
    <div
      ref={containerRef}
      className="mx-auto w-full"
      style={{ maxWidth: "min(92vw, 420px)", height }}
    />
  );
```

oraz w opcjach `Render.create` pozostaw `width: WIDTH, height` (rozdzielczość rysowania), a wizualne skalowanie do kontenera osiąga CSS (`max-width`). Jeśli przy weryfikacji canvas jest zauważalnie rozmyty na szerokich ekranach, dopiero wtedy rozważ przeliczenie `WIDTH` z faktycznej szerokości kontenera (ResizeObserver) — nie rób tego z góry.

```tsx
// ponytail: canvas CSS-skalowany do kontenera, wewn. rozdzielczość stała 320.
// Upgrade path: ResizeObserver -> WIDTH z faktycznej szerokości, tylko jeśli
// rozmycie na szerokim viewporcie przeszkadza.
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: przechodzi.

- [ ] **Step 3: Commit**

```bash
git add src/components/plinko/PlinkoBoard.tsx
git commit -m "feat: responsywne skalowanie planszy Plinko"
```

### Task 4.4: Wiersze Plinko z miniaturą (wzorzec GamePoolList) + większy przycisk

**Files:**
- Modify: `src/components/plinko/PlinkoSetup.tsx`

**Interfaces:**
- Consumes: `activeGames: PoolGame[]` (już przekazywane — mają `coverImageUrl`, `title`), `slotProbabilities` (bez zmian).

- [ ] **Step 1: Dodaj miniaturę i powiększ wiersze**

W `src/components/plinko/PlinkoSetup.tsx` przerób wiersze `<li>` (`PlinkoSetup.tsx:36-62`) na powiększony wzorzec z `GamePoolList` (miniatura + tytuł + etykieta szansy + przyciski). Dodaj import:

```tsx
import Image from "next/image";
```

Wewnątrz `.map`, `gameByAppId.get(id)` daje `PoolGame` (z `coverImageUrl`). Wzór wiersza (miniatura 96×48 jak w `GamePoolList`, większy padding/typografia, zachowane `move(i, -1/1)` i `aria-label`):

```tsx
          <li
            key={id}
            className="bg-card border-border flex items-center gap-3 rounded-xl border p-3 text-foreground"
          >
            {gameByAppId.get(id)?.coverImageUrl && (
              <Image
                src={gameByAppId.get(id)!.coverImageUrl!}
                alt=""
                width={96}
                height={48}
                className="h-12 w-24 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{gameByAppId.get(id)?.title ?? "…"}</p>
              <p className="text-text-secondary text-xs">Szansa {Math.round(probs[i] * 100)}%</p>
            </div>
            <button
              type="button"
              aria-label="W górę"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="text-text-secondary flex h-9 w-9 shrink-0 items-center justify-center text-xl disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="W dół"
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              className="text-text-secondary flex h-9 w-9 shrink-0 items-center justify-center text-xl disabled:opacity-30"
            >
              ↓
            </button>
          </li>
```

- [ ] **Step 2: Powiększ przycisk „Zrzuć"**

Przycisk (`PlinkoSetup.tsx:64-72`): `py-3 text-sm` → `py-4 text-base`. Logika (`onDrop`, `disabled`) bez zmian.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: przechodzi.

- [ ] **Step 4: Commit**

```bash
git add src/components/plinko/PlinkoSetup.tsx
git commit -m "feat: wiersze Plinko z miniaturą gry i większy przycisk zrzutu"
```

### Task 4.5: Większy przycisk flip na ekranie Rzutu monetą

**Files:**
- Modify: `src/components/coinflip/FlipButton.tsx`

- [ ] **Step 1: Powiększ przycisk flip**

W `src/components/coinflip/FlipButton.tsx` zwiększ przycisk do rozmiaru spójnego z „Losuj"/„Zrzuć" (`py-4 text-base`), zachowując istniejącą logikę wyzwalania. (Przeczytaj plik przed edycją — dostosuj klasy do jego obecnej struktury.) Coinflip nie ma wpisów — żaden wzorzec wiersza tu nie wchodzi.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: przechodzi.

- [ ] **Step 3: Commit**

```bash
git add src/components/coinflip/FlipButton.tsx
git commit -m "feat: powiększony przycisk rzutu monetą"
```

### Task 4.6: (Opcjonalnie) dopasowanie odstępów w ekranach mini-gier

**Files:**
- Modify (jeśli potrzebne): `src/components/room/WheelScreen.tsx`, `src/components/room/PlinkoScreen.tsx`, `src/components/room/CoinflipScreen.tsx`

- [ ] **Step 1: Sprawdź proporcje po powiększeniu**

Po zmianach 4.1–4.5 obejrzyj trzy ekrany. Jeśli powiększony wizual/kontrolki nie mieszczą się dobrze (`gap`, `overflow`), dostosuj tylko klasy kontenerów w `*Screen.tsx`. Nie zmieniaj logiki subskrypcji. Jeśli proporcje są OK — pomiń ten task (YAGNI).

- [ ] **Step 2: Commit (jeśli były zmiany)**

```bash
git add src/components/room/WheelScreen.tsx src/components/room/PlinkoScreen.tsx src/components/room/CoinflipScreen.tsx
git commit -m "feat: dopasowanie layoutu ekranów mini-gier do większego wizualu"
```

### Task 4.7: Weryfikacja grupy Feature 4

- [ ] **Step 1: Build + testy**

Run: `npm run build && npx vitest run`
Expected: build zielony, wszystkie istniejące testy przechodzą (w tym `slotProbabilities` — nie ruszamy jego logiki).

- [ ] **Step 2: (Opcjonalnie) weryfikacja wizualna**

Jeśli Playwright MCP dostępny: obejrzyj `/room/<kod>/wheel`, `/room/<kod>/plinko`, `/room/<kod>/coinflip` na wąskim viewporcie (mobile). Potwierdź: koło skaluje się do szerokości, plansza Plinko wypełnia dostępną szerokość, wiersze Plinko mają miniatury, wiersze Koła są większe (bez miniatur), przyciski akcji są większe. Jeśli niedostępny — pomiń.

---

## Tabela plików (potwierdzenie: zero konfliktów)

| Feature | Branch | Pliki (wszystkie rozłączne) |
|---------|--------|------------------------------|
| 1 | `fix/firestore-longpolling` | `src/lib/firebase.ts` |
| 2 | `feat/swipe-image-quality` | `src/lib/steamImages.ts` (nowy), `src/lib/steamImages.test.ts` (nowy), `src/components/swipe/SwipeCard.tsx` |
| 3 | `feat/global-packages-page` | `src/app/packages/page.tsx` (nowy), `src/app/page.tsx` |
| 4 | `feat/minigame-screen-redesign` | `src/components/wheel/WheelCanvas.tsx`, `src/components/wheel/WheelControls.tsx`, `src/components/plinko/PlinkoBoard.tsx`, `src/components/plinko/PlinkoSetup.tsx`, `src/components/coinflip/FlipButton.tsx`, (opc.) `src/components/room/{Wheel,Plinko,Coinflip}Screen.tsx` |

Żaden branch nie dotyka `firestore.rules` ani `src/lib/rooms.ts`. Wszystkie cztery w pełni równoległe — worktree per branch, merge w dowolnej kolejności, bez rebase-konfliktów.
