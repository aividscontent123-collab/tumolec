# Tryb solo w stylu Dustpile — Faza A1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zamienić stronę główną Tumolec na ekran solo w stylu Dustpile (import biblioteki Steam, filtry backlogu, swipe lokalnie w przeglądarce) i wdrożyć nowy, niebieski system wizualny wszędzie w apce.

**Architecture:** Nowy endpoint server-side pobiera bibliotekę Steam (appid+czas gry, tanio). Filtr backlogu liczy się od razu na tych danych (czysta funkcja). Filtr solo/multi i okładki dociągają się leniwie, karta po karcie, przez istniejący `/api/steam/details` (już ma cache). Swipe solo trzyma stan wyłącznie w React state — bez Firestore, bez pokoju. Nowy system wizualny to zmiana tokenów CSS + jeden współdzielony komponent `ToggleChip`, więc rozlewa się na resztę apki bez osobnej przebudowy każdego ekranu.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Tailwind v4, Firebase Firestore (tylko `steam_cache`, żadnych nowych kolekcji w tym planie), Vitest.

**Zależy od**: `docs/superpowers/specs/2026-07-13-dustpile-inspired-solo-mode-design.md` (zatwierdzony spec, Faza A). To jest PIERWSZA z dwóch części Fazy A — Faza A2 (upgrade do co-op, wspólne biblioteki, przeniesienie mini-gier) to osobny plan, pisany po zakończeniu tego.

## Global Constraints

- **To NIE jest znany ci Next.js.** Przed pisaniem kodu Next (routing, `next/image`) przeczytaj `node_modules/next/dist/docs/` (patrz `AGENTS.md` w root).
- **Nigdy nie commituj na `master`** bez wyraźnej zgody — pracuj i commituj lokalnie, mergowanie i push to osobna decyzja na końcu.
- **Klucz Steam Web API** już jest w `.env.local` jako `STEAM_API_KEY` (server-side, NIGDY w kliencie/`NEXT_PUBLIC_`).
- **Alias importu:** `@/` → `src/`.
- **Testy:** kolokowane `*.test.ts`, Vitest, `describe`/`it`, środowisko `node`. Uruchamianie: `npx vitest run`.
- **Copy UI po polsku.**
- **Bar weryfikacji na koniec każdej grupy:** `npm run build` (musi przejść) + `npx vitest run` (wszystkie zielone).
- **BEZ trailera `Co-Authored-By`** w commitach.

---

## Grupa 1: System wizualny (fundament, idzie pierwsza)

### Task 1.1: Nowe tokeny kolorów — akcent niebieski + poświata

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `--accent-glow` (nowy token, używany przez `ToggleChip` w Tasku 1.3).

- [ ] **Step 1: Zmień akcent z fioletu na niebieski**

W `src/app/globals.css`, w bloku `:root`, zamień:
```css
  --accent-brand: #8b5cf6;
  --accent-brand-soft: rgba(139, 92, 246, 0.22);
```
na:
```css
  --accent-brand: #3b82f6;
  --accent-brand-soft: rgba(59, 130, 246, 0.22);
  --accent-glow: rgba(59, 130, 246, 0.55);
```

W bloku `.dark`, zamień:
```css
  --accent-brand-soft: rgba(139, 92, 246, 0.35);
```
na:
```css
  --accent-brand-soft: rgba(59, 130, 246, 0.35);
  --accent-glow: rgba(59, 130, 246, 0.7);
```

- [ ] **Step 2: Dodaj `--color-accent-glow` do `@theme inline`**

W bloku `@theme inline` w tym samym pliku, obok istniejącej linii `--color-accent-brand-soft: var(--accent-brand-soft);`, dodaj:
```css
  --color-accent-glow: var(--accent-glow);
```

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: przechodzi bez błędów.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: niebieski akcent + token poświaty (system wizualny Dustpile)"
```

### Task 1.2: Ambientowe tło (`bg-app-gradient`)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Rozszerz `.bg-app-gradient` o rozmyte plamy koloru**

W `src/app/globals.css`, w bloku `@layer utilities`, zamień:
```css
  .bg-app-gradient {
    background: linear-gradient(180deg, var(--gradient-top) 0%, var(--gradient-bottom) 100%);
  }
```
na:
```css
  .bg-app-gradient {
    background:
      radial-gradient(60% 40% at 15% 10%, var(--accent-brand-soft) 0%, transparent 70%),
      radial-gradient(50% 35% at 85% 25%, var(--accent-brand-soft) 0%, transparent 70%),
      linear-gradient(180deg, var(--gradient-top) 0%, var(--gradient-bottom) 100%);
  }
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: przechodzi.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: ambientowe plamy koloru w tle (styl Dustpile)"
```

### Task 1.3: Komponent `ToggleChip`

**Files:**
- Create: `src/components/ui/ToggleChip.tsx`

**Interfaces:**
- Produces (używane przez Grupę 3): `ToggleChip<T extends string>({ value, options, onChange, columns })` — kontrolowany komponent pojedynczego wyboru.

- [ ] **Step 1: Zaimplementuj komponent**

Utwórz `src/components/ui/ToggleChip.tsx`:

```tsx
"use client";

/** Siatka wzajemnie wykluczających się kafelków-przełączników (pojedynczy
 * wybór). Jeden współdzielony wzorzec dla filtrów w całej apce (backlog,
 * solo/multi, i kolejnych w Fazie B) -- podświetlone obramowanie + poświata
 * na aktywnym kafelku, zamiast stylować to osobno na każdym ekranie. */
export function ToggleChip<T extends string>({
  value,
  options,
  onChange,
  columns = 2,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={columns === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
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

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: przechodzi (komponent jeszcze nieużywany nigdzie, ale musi się typecheckować).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/ToggleChip.tsx
git commit -m "feat: komponent ToggleChip - wspolny wzorzec filtrow"
```

### Task 1.4: Weryfikacja Grupy 1

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: zielony.

---

## Grupa 2: Warstwa danych — biblioteka Steam

### Task 2.1: `filterByPlaytime` + `shuffleGames` (TDD)

**Files:**
- Create: `src/lib/steamLibrary.ts`
- Test: `src/lib/steamLibrary.test.ts`

**Interfaces:**
- Produces (używane przez Grupę 3 i 4): `SteamOwnedGame = { steamAppId: number; name: string; playtimeMinutes: number }`, `BacklogFilter = "never" | "under2h" | "under10h" | "abandoned"`, `filterByPlaytime(games, filter): SteamOwnedGame[]`, `shuffleGames(games): SteamOwnedGame[]`.

- [ ] **Step 1: Napisz failing test**

Utwórz `src/lib/steamLibrary.test.ts`:

```tsx
import { describe, expect, it } from "vitest";
import { filterByPlaytime, shuffleGames, type SteamOwnedGame } from "./steamLibrary";

function game(steamAppId: number, playtimeMinutes: number): SteamOwnedGame {
  return { steamAppId, name: `Game ${steamAppId}`, playtimeMinutes };
}

describe("filterByPlaytime", () => {
  const games = [
    game(1, 0), // nigdy nie grane
    game(2, 119), // <2h
    game(3, 120), // dokładnie 2h -- brzeg "porzucone"
    game(4, 599), // <10h, wciąż "porzucone" (2-10h)
    game(5, 600), // dokładnie 10h -- brzeg, NIE "porzucone" ani "<10h"
    game(6, 1000), // dużo grane
  ];

  it("never: tylko playtime === 0", () => {
    expect(filterByPlaytime(games, "never").map((g) => g.steamAppId)).toEqual([1]);
  });

  it("under2h: playtime < 120", () => {
    expect(filterByPlaytime(games, "under2h").map((g) => g.steamAppId)).toEqual([1, 2]);
  });

  it("under10h: playtime < 600", () => {
    expect(filterByPlaytime(games, "under10h").map((g) => g.steamAppId)).toEqual([1, 2, 3, 4]);
  });

  it("abandoned: 120 <= playtime < 600 (2-10h)", () => {
    expect(filterByPlaytime(games, "abandoned").map((g) => g.steamAppId)).toEqual([3, 4]);
  });
});

describe("shuffleGames", () => {
  it("zwraca te same elementy w innej tablicy (nie mutuje wejścia)", () => {
    const games = [game(1, 0), game(2, 0), game(3, 0)];
    const shuffled = shuffleGames(games);
    expect(shuffled).not.toBe(games);
    expect(shuffled.map((g) => g.steamAppId).sort()).toEqual([1, 2, 3]);
    expect(games.map((g) => g.steamAppId)).toEqual([1, 2, 3]); // wejście nietknięte
  });
});
```

- [ ] **Step 2: Uruchom test — musi FAIL**

Run: `npx vitest run src/lib/steamLibrary.test.ts`
Expected: FAIL — moduł `./steamLibrary` nie istnieje.

- [ ] **Step 3: Zaimplementuj**

Utwórz `src/lib/steamLibrary.ts`:

```tsx
/** Filtrowanie i porządkowanie biblioteki Steam użytkownika (tryb solo).
 * Dane wejściowe pochodzą z `IPlayerService/GetOwnedGames` (appid+playtime,
 * bez okładek/tagów -- te dociągają się leniwie osobno, patrz SoloSwipeScreen). */

export type SteamOwnedGame = {
  steamAppId: number;
  name: string;
  playtimeMinutes: number;
};

export type BacklogFilter = "never" | "under2h" | "under10h" | "abandoned";

export function filterByPlaytime(games: SteamOwnedGame[], filter: BacklogFilter): SteamOwnedGame[] {
  switch (filter) {
    case "never":
      return games.filter((g) => g.playtimeMinutes === 0);
    case "under2h":
      return games.filter((g) => g.playtimeMinutes < 120);
    case "under10h":
      return games.filter((g) => g.playtimeMinutes < 600);
    case "abandoned":
      return games.filter((g) => g.playtimeMinutes >= 120 && g.playtimeMinutes < 600);
  }
}

/** Fisher-Yates. Talia swipe'a nie ma sensu w kolejności alfabetycznej/appid --
 * losowa kolejność to punkt wyjścia, nie tylko kosmetyka. */
export function shuffleGames(games: SteamOwnedGame[]): SteamOwnedGame[] {
  const result = [...games];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

- [ ] **Step 4: Uruchom test — musi PASS**

Run: `npx vitest run src/lib/steamLibrary.test.ts`
Expected: PASS, 5 testów.

- [ ] **Step 5: Commit**

```bash
git add src/lib/steamLibrary.ts src/lib/steamLibrary.test.ts
git commit -m "feat: filterByPlaytime + shuffleGames - filtrowanie backlogu Steam"
```

### Task 2.2: Endpoint importu biblioteki Steam

**Files:**
- Create: `src/app/api/steam/library/route.ts`

**Interfaces:**
- Consumes: `SteamOwnedGame` (Task 2.1), `STEAM_API_KEY` z env.
- Produces (używane przez Grupę 3): `GET /api/steam/library?profile=<url|vanity|steamid64>` → `{ games: SteamOwnedGame[] }` lub `{ error: string }`.

- [ ] **Step 1: Zaimplementuj endpoint**

Utwórz `src/app/api/steam/library/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import type { SteamOwnedGame } from "@/lib/steamLibrary";

const STEAMID64_RE = /^\d{17}$/;

/** Wyciąga vanity name albo steamid64 z dowolnej formy wejścia -- pełny URL,
 * sama nazwa, albo już gotowe steamid64. Ten sam kształt wejścia co dzisiejsze
 * pole wyszukiwania profilu (URL steamcommunity.com/id/... lub /profiles/...). */
function extractVanityOrId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/steamcommunity\.com\/(?:id|profiles)\/([^/?#]+)/i);
  return match ? match[1] : trimmed;
}

async function resolveSteamId64(vanityOrId: string, apiKey: string): Promise<string> {
  if (STEAMID64_RE.test(vanityOrId)) return vanityOrId;
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(vanityOrId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ResolveVanityURL failed: ${res.status}`);
  const data = (await res.json()) as { response: { success: number; steamid?: string } };
  if (data.response.success !== 1 || !data.response.steamid) {
    throw new Error("not-found");
  }
  return data.response.steamid;
}

type GetOwnedGamesRaw = { appid: number; name: string; playtime_forever: number };

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get("profile");
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Brak STEAM_API_KEY po stronie serwera." }, { status: 500 });
  }
  if (!input || !input.trim()) {
    return NextResponse.json({ error: "Podaj link do profilu Steam." }, { status: 400 });
  }

  let steamId64: string;
  try {
    steamId64 = await resolveSteamId64(extractVanityOrId(input), apiKey);
  } catch {
    return NextResponse.json({ error: "Nie znaleziono profilu Steam o tej nazwie." }, { status: 404 });
  }

  try {
    const ownedUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId64}&include_appinfo=1&include_played_free_games=1`;
    const ownedRes = await fetch(ownedUrl);
    if (!ownedRes.ok) {
      return NextResponse.json({ error: "Nie udało się pobrać biblioteki ze Steam." }, { status: 502 });
    }
    const owned = (await ownedRes.json()) as {
      response: { game_count?: number; games?: GetOwnedGamesRaw[] };
    };
    if (!owned.response.game_count || !owned.response.games) {
      return NextResponse.json(
        {
          error:
            "Profil jest prywatny albo biblioteka jest pusta. Ustaw \"Szczegóły gry\" na publiczne w ustawieniach prywatności Steam.",
        },
        { status: 404 },
      );
    }
    const games: SteamOwnedGame[] = owned.response.games.map((g) => ({
      steamAppId: g.appid,
      name: g.name,
      playtimeMinutes: g.playtime_forever,
    }));
    return NextResponse.json({ games });
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać biblioteki ze Steam." }, { status: 502 });
  }
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: przechodzi.

- [ ] **Step 3: Ręczna weryfikacja z prawdziwym profilem**

Uruchom `npm run dev`, w drugim terminalu:
```bash
curl "http://localhost:3000/api/steam/library?profile=TWOJA_NAZWA_LUB_URL_STEAM"
```
Expected: JSON z `games: [...]` (setki pozycji dla typowej biblioteki). Sprawdź też profil prywatny (dowolny znajomy z prywatnym profilem) — expected: czytelny `error`, status 404, nie 500/crash.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/steam/library/route.ts
git commit -m "feat: endpoint importu biblioteki Steam (GetOwnedGames)"
```

### Task 2.3: Weryfikacja Grupy 2

- [ ] **Step 1: Build + testy**

Run: `npm run build && npx vitest run`
Expected: build zielony, testy przechodzą (w tym 5 z `steamLibrary.test.ts`).

---

## Grupa 3: Ekran ustawień solo

### Task 3.1: `SoloSettingsScreen`

**Files:**
- Create: `src/components/solo/SoloSettingsScreen.tsx`

**Interfaces:**
- Consumes: `ToggleChip` (Task 1.3), `BacklogFilter` (Task 2.1).
- Produces (używane przez Task 3.2): `SoloSettingsScreen({ onLoadLibrary, loading, error })` — kontrolowany formularz, wywołuje `onLoadLibrary(profileInput, backlogFilter, multiplayerFilter)` po submit. Stan lokalny (input/filtry) żyje wewnątrz komponentu.

- [ ] **Step 1: Zaimplementuj komponent**

Utwórz `src/components/solo/SoloSettingsScreen.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { roomExists } from "@/lib/rooms";
import type { BacklogFilter } from "@/lib/steamLibrary";

export type MultiplayerFilter = "all" | "solo" | "multi";

const BACKLOG_OPTIONS: { value: BacklogFilter; label: string }[] = [
  { value: "never", label: "Nigdy nie grane (0 min)" },
  { value: "under2h", label: "Mniej niż 2 godziny gry" },
  { value: "under10h", label: "Mniej niż 10 godzin gry" },
  { value: "abandoned", label: "Porzucone (2-10 h)" },
];

const MULTIPLAYER_OPTIONS: { value: MultiplayerFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "solo", label: "Jednoosobowe" },
  { value: "multi", label: "Wieloosobowe" },
];

export function SoloSettingsScreen({
  onLoadLibrary,
  loading,
  error,
}: {
  onLoadLibrary: (profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) => void;
  loading: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState("");
  const [backlog, setBacklog] = useState<BacklogFilter>("never");
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("all");
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setJoinError(null);
    if (!(await roomExists(code))) {
      setJoinError(`Nie znaleziono pokoju o kodzie ${code}.`);
      setJoining(false);
      return;
    }
    router.push(`/room/${code}`);
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col items-center justify-center px-[22px]">
      <div className="w-full max-w-sm">
        <h1 className="font-heading mb-1 text-center text-[30px] font-bold text-foreground">
          Tumolec
        </h1>
        <p className="text-text-secondary mb-6 text-center text-sm">
          Przeglądaj gry kurzące się w twojej bibliotece: w prawo znaczy „zagram", w lewo „pomiń".
        </p>

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

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-foreground">Które gry pokazywać?</p>
          <ToggleChip value={backlog} options={BACKLOG_OPTIONS} onChange={setBacklog} columns={2} />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-foreground">Jak chcesz grać?</p>
          <ToggleChip value={multiplayer} options={MULTIPLAYER_OPTIONS} onChange={setMultiplayer} columns={3} />
        </div>

        {error && <p className="text-pass mt-4 text-sm">{error}</p>}

        <button
          type="button"
          disabled={loading || !profile.trim()}
          onClick={() => onLoadLibrary(profile.trim(), backlog, multiplayer)}
          className="bg-accent-brand mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
        >
          {loading ? "Wczytuję…" : "Wczytaj bibliotekę"}
        </button>

        <div className="mt-6 flex flex-col items-center gap-2">
          <Link href="/packages" className="text-text-secondary text-center text-sm underline">
            Zapisane paczki gier
          </Link>
          <button
            type="button"
            onClick={() => setShowJoin((v) => !v)}
            className="text-text-secondary text-center text-sm underline"
          >
            Mam kod pokoju od znajomego
          </button>
          {showJoin && (
            <form onSubmit={handleJoinByCode} className="mt-2 flex w-full gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="np. K7M2QP"
                className="bg-card border-border flex-1 rounded-xl border px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-foreground uppercase"
              />
              <button
                type="submit"
                disabled={joining}
                className="bg-secondary rounded-xl px-4 py-3 text-sm font-bold text-foreground disabled:opacity-50"
              >
                Dołącz
              </button>
            </form>
          )}
          {joinError && <p className="text-pass text-sm">{joinError}</p>}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Zweryfikuj build**

Run: `npm run build`
Expected: przechodzi (komponent jeszcze niepodłączony do `page.tsx`, ale musi się typecheckować).

- [ ] **Step 3: Commit**

```bash
git add src/components/solo/SoloSettingsScreen.tsx
git commit -m "feat: SoloSettingsScreen - ekran ustawien solo w stylu Dustpile"
```

### Task 3.2: `SoloHome` (maszyna stanów) + przepięcie `page.tsx`

**Files:**
- Create: `src/components/solo/SoloHome.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `SoloSettingsScreen` (Task 3.1), `filterByPlaytime`/`shuffleGames`/`SteamOwnedGame`/`BacklogFilter` (Task 2.1), `SoloSwipeScreen` (Task 4.2).
- **Kolejność wykonania: zrób Task 4.2 PRZED tym taskiem.** `SoloHome` importuje `SoloSwipeScreen`, więc wykonanie w numerycznej kolejności (3.2 przed 4.2) dałoby przejściowo niebudujący się kod. `SoloSwipeScreen` (Task 4.2) nie zależy od `SoloHome` w drugą stronę, więc odwrócenie kolejności nie psuje niczego innego.

- [ ] **Step 1: Zaimplementuj `SoloHome`**

Utwórz `src/components/solo/SoloHome.tsx`:

```tsx
"use client";

import { useState } from "react";
import { SoloSettingsScreen, type MultiplayerFilter } from "@/components/solo/SoloSettingsScreen";
import { SoloSwipeScreen } from "@/components/solo/SoloSwipeScreen";
import { filterByPlaytime, shuffleGames, type BacklogFilter, type SteamOwnedGame } from "@/lib/steamLibrary";

type Screen =
  | { name: "settings" }
  | { name: "swipe"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter };

export function SoloHome() {
  const [screen, setScreen] = useState<Screen>({ name: "settings" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadLibrary(profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/steam/library?profile=${encodeURIComponent(profile)}`);
      const data = (await res.json()) as { games?: SteamOwnedGame[]; error?: string };
      if (!res.ok || !data.games) {
        setError(data.error ?? "Nie udało się wczytać biblioteki.");
        setLoading(false);
        return;
      }
      const filtered = filterByPlaytime(data.games, backlog);
      if (filtered.length === 0) {
        setError("Brak gier pasujących do tego filtra.");
        setLoading(false);
        return;
      }
      setScreen({ name: "swipe", pool: shuffleGames(filtered), multiplayer });
      setLoading(false);
    } catch {
      setError("Coś poszło nie tak. Spróbuj ponownie.");
      setLoading(false);
    }
  }

  if (screen.name === "swipe") {
    return (
      <SoloSwipeScreen
        pool={screen.pool}
        multiplayerFilter={screen.multiplayer}
        onExit={() => setScreen({ name: "settings" })}
      />
    );
  }

  return <SoloSettingsScreen onLoadLibrary={handleLoadLibrary} loading={loading} error={error} />;
}
```

- [ ] **Step 2: Przepnij `page.tsx`**

Zamień całą zawartość `src/app/page.tsx` na:

```tsx
import { SoloHome } from "@/components/solo/SoloHome";

export default function Home() {
  return <SoloHome />;
}
```

(Stary formularz create/join room jest usuwany z tego pliku — dołączanie po kodzie żyje teraz w `SoloSettingsScreen`, zob. Task 3.1.)

- [ ] **Step 3: Zweryfikuj build**

Run: `npm run build`
Expected: przechodzi (przy zachowaniu kolejności z sekcji "Interfaces" — `SoloSwipeScreen` z Task 4.2 już istnieje).

- [ ] **Step 4: Commit**

```bash
git add src/components/solo/SoloHome.tsx src/app/page.tsx
git commit -m "feat: SoloHome - maszyna stanow ustawienia/swipe, strona glowna = solo"
```

---

## Grupa 4: Ekran swipe solo

### Task 4.1: (informacyjny) Kształt danych karty

Bez nowych plików w tym tasku — tylko przypomnienie kontraktu przed Task 4.2: `SwipeGame` (z `src/lib/types.ts`, już istnieje) ma pola `steamAppId, title, coverImageUrl?, tags, reviewScorePercent, reviewSummary`. Endpoint `/api/steam/details?appid=N` (już istnieje, `src/app/api/steam/details/route.ts`) zwraca `{ steamAppId, name, headerImageUrl, steamUrl, shortDescription, reviewSummary, reviewScorePercent, tags, ... }` — mapowanie `name→title`, `headerImageUrl→coverImageUrl` dzieje się w Task 4.2.

### Task 4.2: `SoloSwipeScreen`

**Files:**
- Create: `src/components/solo/SoloSwipeScreen.tsx`

**Interfaces:**
- Consumes: `SteamOwnedGame` (Task 2.1), `MultiplayerFilter` (Task 3.1), `SwipeCard` (istniejący `@/components/swipe/SwipeCard`), `SwipeActionButtons` (istniejący `@/components/swipe/SwipeActionButtons`), `SwipeGame` (istniejący `@/lib/types`).
- Produces: `SoloSwipeScreen({ pool, multiplayerFilter, onExit })` — samowystarczalny ekran, żadnego zapisu do Firestore.

- [ ] **Step 1: Zaimplementuj komponent**

Utwórz `src/components/solo/SoloSwipeScreen.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import type { SwipeGame } from "@/lib/types";
import type { SteamOwnedGame } from "@/lib/steamLibrary";
import type { MultiplayerFilter } from "@/components/solo/SoloSettingsScreen";

type DetailsResponse = {
  steamAppId: number;
  name: string;
  headerImageUrl: string;
  tags: string[];
  reviewScorePercent: number;
  reviewSummary: string;
  error?: string;
};

function matchesMultiplayerFilter(tags: string[], filter: MultiplayerFilter): boolean {
  if (filter === "all") return true;
  if (filter === "solo") return tags.includes("Single-player");
  return tags.includes("Multi-player") || tags.includes("Co-op");
}

/** Solo: żadnego zapisu do Firestore, żadnego pokoju -- decyzje żyją tylko
 * w stanie tego komponentu, zgodnie z zachowaniem Dustpile ("Twoje wybory
 * zostają w przeglądarce"). Karty dociągane leniwie: appdetails wołane
 * dopiero dla kolejnego kandydata z `pool`, pomijane jeśli nie pasuje do
 * filtra solo/multi -- nigdy nie pytamy o więcej niż faktycznie pokazujemy. */
export function SoloSwipeScreen({
  pool,
  multiplayerFilter,
  onExit,
}: {
  pool: SteamOwnedGame[];
  multiplayerFilter: MultiplayerFilter;
  onExit: () => void;
}) {
  const cursorRef = useRef(0);
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loadingCard, setLoadingCard] = useState(true);

  async function advance() {
    setLoadingCard(true);
    while (cursorRef.current < pool.length) {
      const candidate = pool[cursorRef.current];
      cursorRef.current += 1;
      try {
        const res = await fetch(`/api/steam/details?appid=${candidate.steamAppId}`);
        const data = (await res.json()) as DetailsResponse;
        if (!res.ok || data.error) continue;
        if (!matchesMultiplayerFilter(data.tags, multiplayerFilter)) continue;
        setCurrentCard({
          steamAppId: data.steamAppId,
          title: data.name,
          coverImageUrl: data.headerImageUrl,
          tags: data.tags,
          reviewScorePercent: data.reviewScorePercent,
          reviewSummary: data.reviewSummary,
        });
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

  useEffect(() => {
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSwipe() {
    advance();
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Twoja biblioteka</h1>
      </div>

      <div className="min-h-0 flex-1">
        {loadingCard ? (
          <p className="text-text-secondary p-6 text-center text-sm">Szukam kolejnej gry…</p>
        ) : exhausted ? (
          <p className="text-text-secondary p-6 text-center text-sm">
            To wszystkie gry pasujące do Twoich filtrów.
          </p>
        ) : currentCard ? (
          <SwipeCard game={currentCard} onSwipe={handleSwipe} />
        ) : null}
      </div>

      {!exhausted && <SwipeActionButtons onPass={handleSwipe} onLike={handleSwipe} />}
    </main>
  );
}
```

- [ ] **Step 2: Zweryfikuj build (teraz z Task 3.2 razem)**

Run: `npm run build`
Expected: przechodzi -- to zamyka zależność z Task 3.2 Step 3.

- [ ] **Step 3: Ręczna weryfikacja**

`npm run dev`, otwórz `/`, wklej prawdziwy publiczny profil Steam, wybierz filtr "Nigdy nie grane", kliknij "Wczytaj bibliotekę". Expected: po chwili pojawia się karta gry z okładką, tytułem, tagami; swipe w lewo/prawo (albo przyciski) pokazuje kolejną; po wyczerpaniu puli pokazuje się komunikat końcowy, nie biały ekran/crash.

- [ ] **Step 4: Commit**

```bash
git add src/components/solo/SoloSwipeScreen.tsx
git commit -m "feat: SoloSwipeScreen - swipe lokalny po bibliotece Steam, bez Firestore"
```

### Task 4.3: Weryfikacja Grupy 3+4 łącznie

- [ ] **Step 1: Build + testy**

Run: `npm run build && npx vitest run`
Expected: build zielony, wszystkie testy przechodzą (44 istniejące + 5 nowych z `steamLibrary.test.ts`).

- [ ] **Step 2: Pełny przebieg ręczny**

Od strony głównej: wklej profil → wybierz filtry → wczytaj → swipe kilku kart → wróć (`‹`) → sprawdź że "Zapisane paczki gier" i "Mam kod pokoju od znajomego" dalej działają (link do `/packages`, dołączenie do istniejącego pokoju po kodzie nawiguje do `/room/{code}`).

---

## Tabela plików

| Grupa | Pliki |
|-------|-------|
| 1 (wizualny) | `src/app/globals.css`, `src/components/ui/ToggleChip.tsx` (nowy) |
| 2 (dane Steam) | `src/lib/steamLibrary.ts` (nowy), `src/lib/steamLibrary.test.ts` (nowy), `src/app/api/steam/library/route.ts` (nowy) |
| 3 (ustawienia) | `src/components/solo/SoloSettingsScreen.tsx` (nowy), `src/components/solo/SoloHome.tsx` (nowy), `src/app/page.tsx` |
| 4 (swipe solo) | `src/components/solo/SoloSwipeScreen.tsx` (nowy) |

Grupa 1 i 2 są w pełni niezależne od siebie (mogą iść równolegle w osobnych worktree'ach). Grupa 3 zależy od Grupy 1 (`ToggleChip`) i Grupy 2 (`filterByPlaytime`/endpoint). Task 4.2 (`SoloSwipeScreen`) zależy tylko od Task 3.1 (typ `MultiplayerFilter`) i istniejących `SwipeCard`/`SwipeActionButtons` (bez zmian w nich) — **wykonaj go przed Task 3.2**, która dopiero go importuje (zob. uwaga o kolejności w Task 3.2). Grupy 3+4 razem dotykają `src/app/page.tsx` i nowego katalogu `src/components/solo/` — praktycznie jedna sekwencyjna praca, nie do rozbicia na bezpieczne równoległe worktree'e tak jak Grupy 1+2.

## Po tym planie

Faza A2 (osobny plan, po zakończeniu i przetestowaniu tego): upgrade solo→co-op (przycisk "Co-op/Dodaj znajomego", popup z kodem/linkiem/QR, nowe pole `steamLibraryAppIds` na uczestniku, `computeSharedLibrary`, zmiana w `firestore.rules`) oraz przeniesienie Koła/Plinko/Rzutu monetą pod pływający przycisk boczny z trybem lokalnym.
