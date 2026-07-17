# Swipe Screen Polish — Design

## Kontekst

Cztery niezależne zgłoszenia użytkownika po użytkowaniu Explore/swipe na żywo:

1. **Bug**: panel mediów (zdjęcia/trailer) czasem nie pokazuje się mimo że gra ma je na Steamie.
2. **Feature**: procent opinii zawsze wyświetla się na zielono, niezależnie od wyniku.
3. **Feature**: przełącznik motywu i przycisk "❤️ Polubione" nachodzą na siebie w prawym górnym rogu; brak licznika polubionych w pokoju.
4. **Feature**: rozszerzenie filtra z ekranu swipe (dziś tylko 8 gatunków) o Kooperację, Multiplayer, filtr daty premiery (Nowości/Wkrótce), więcej popularnych tagów Steama i wyszukiwarkę dowolnego tagu.

## 1. Bug: brakujący panel mediów — root cause potwierdzony danymi produkcyjnymi

**Przyczyna:** `screenshots`/`trailerHlsUrl`/`movies` dodane do `SteamCacheEntry` w commicie `110bd72` (2026-07-14), ale `steam_cache` zbiera dane od `ab6b19c` (2026-07-11, Faza 1) — 3-dniowe okno, w którym każda scache'owana gra ma te pola całkowicie nieobecne w dokumencie Firestore. Cache ma `CACHE_TTL_MS = 30 dni` liczone tylko z wieku (`Date.now() - data.cachedAt`), bez sprawdzania kompletności schematu.

**Zweryfikowane bezpośrednio na produkcyjnym Firestore** (skrypt diagnostyczny, jednorazowy, nie wchodzi do repo): 778 dokumentów w `steam_cache`, z czego 568 (73%) ma `cachedAt` sprzed `110bd72` — i wszystkie 568 bez wyjątku nie mają pola `screenshots` ani `trailerHlsUrl` w ogóle (nie: puste, tylko: nieobecne). `GameDetailLayout.tsx`: `hasMedia = game.trailerHlsUrl !== null || game.screenshots.length > 0` — dla tych gier zawsze `false`, cały panel się chowa (świadome zachowanie dla gier bez mediów, ale te dane MAJĄ media, tylko cache o tym nie wie).

**Fix**: `src/app/api/steam/details/route.ts` — rozszerzyć warunek świeżości cache'a o sprawdzenie kompletności schematu:

```ts
const cached = await getDoc(cacheRef);
if (cached.exists()) {
  const data = cached.data() as SteamCacheEntry;
  const isFresh = Date.now() - data.cachedAt < CACHE_TTL_MS;
  const hasMediaFields = Object.prototype.hasOwnProperty.call(data, "screenshots");
  if (isFresh && hasMediaFields) {
    return NextResponse.json({ steamAppId, ...data });
  }
}
```

Wymusza natychmiastowy refetch (zamiast czekania do ~2026-08-13) dla dowolnego wpisu sprzed dodania pola — ten sam mechanizm samo-naprawy który już istnieje w projekcie, tylko wyzwalany też przez niekompletność schematu, nie wyłącznie przez wiek. Zero migracji danych, zero nowych plików — jedna dodatkowa linia warunku w istniejącej ścieżce odczytu.

## 2. Gradient kolorów procentu opinii

**Progi** (pokrywają się z własną kategoryzacją Steama: Mixed = 40-69%, Positive+ = 70%+):
- `< 40%` — czerwony (reużycie istniejącego tokenu `--pass`, już oznacza "źle/negatywnie" w całej apce)
- `40–69%` — żółty (**nowy token** `--rating-mid`)
- `≥ 70%` — zielony (istniejący `--rating`, bez zmian)

**Dlaczego nowa funkcja zamiast zmiany `--rating`:** `--rating` jest używany w kilku miejscach niezwiązanych z procentem opinii jako stały akcent "dobrze/pozytywnie" (confetti `WinnerScreen.tsx`, plakietka "GRAMY" przy swipe w prawo `SwipeCard.tsx`, ikona kciuka w górę pojedynczej recenzji `ReleaseOrReviewsPanel.tsx:57`) — zmiana jego znaczenia na zależne od proc entu zepsułaby te miejsca. Nowa, mała, czysta funkcja dotyka tylko wyświetlania samego procentu.

**Nowy token** w `src/app/globals.css` (ten sam wzorzec co `--rating`/`--pass`, hue ~85 = żółty, dopasowana jasność/nasycenie do reszty palety):
```css
/* w bloku @theme inline (linia ~18) */
--color-rating-mid: var(--rating-mid);

/* dark theme */
--rating-mid: oklch(0.65 0.16 85);
/* light theme */
--rating-mid: oklch(0.75 0.14 85);
```

**Nowa funkcja** `src/lib/reviewScore.ts` (czysta, testowalna Vitest):
```ts
export function reviewScoreColorClass(percent: number): string {
  if (percent < 40) return "text-pass";
  if (percent < 70) return "text-rating-mid";
  return "text-rating";
}
```

**Użycie** — dwa miejsca, obie zamiast statycznego `text-rating` na samym elemencie procentu (reszta klas bez zmian):
- `ReleaseOrReviewsPanel.tsx:45` — `<div className={\`font-heading ${reviewScoreColorClass(game.reviewScorePercent)} text-2xl font-bold\`}>{game.reviewScorePercent}%</div>`
- `GamePoolList.tsx:34` — `<p className={\`${reviewScoreColorClass(game.reviewScorePercent)} text-xs\`}>{game.reviewScorePercent}% {game.reviewSummary}</p>`

`ThumbsUp`/`ThumbsDown` w pojedynczych recenzjach (`ReleaseOrReviewsPanel.tsx:56-59`) zostają bez zmian — to binarny wskaźnik "ta recenzja była pozytywna", nie procent, nie dotyczy tego zgłoszenia.

## 3. Odstępy nagłówka + licznik Polubionych w pokoju

**Nachodzenie:** `ThemeToggle` (`src/components/ThemeToggle.tsx`) to `position: fixed; top-3 right-3; z-50` — globalny, poza przepływem układu, renderowany raz w `layout.tsx`. Nagłówki `SoloSwipeScreen`/`RoomExploreScreen` mają osobny element wypchnięty na prawo przez `ml-auto` w normalnym `flex` — żaden z nich nie rezerwuje miejsca dla drugiego.

**Fix**: dodać `pr-12` (48px — pokrywa 36px szerokości przełącznika + 12px odstępu od krawędzi) do kontenera nagłówka w obu plikach:
- `SoloSwipeScreen.tsx:185` — `<div className="flex items-center gap-3 pr-12">`
- `RoomExploreScreen.tsx:246` — `<div className="flex items-center gap-3 pr-12">`

**Licznik Polubionych w pokoju:** solo już pokazuje `❤️ {getLocalLiked().length}` (`SoloSwipeScreen.tsx:202`). Pokój pokazuje sam link `❤️ Polubione` bez liczby (`RoomExploreScreen.tsx:255-257`). Fix: subskrybować `subscribeToLiked` (już istnieje w `rooms.ts:558`, używane w ekranie Polubionych) i pokazać `.length`:

```tsx
const [likedCount, setLikedCount] = useState(0);
useEffect(() => subscribeToLiked(roomCode, (games) => setLikedCount(games.length)), [roomCode]);
// ...
<Link href={`/room/${roomCode}/liked`} className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground">
  ❤️ {likedCount}
</Link>
```

`subscribeToLiked` robi `getDoc` na `steam_cache` dla każdej polubionej gry (potrzebne do pełnych danych na ekranie Polubionych) — dla samego licznika to niepotrzebny narzut, ale reużycie istniejącej subskrypcji jest prostsze niż pisać drugą, węższą tylko dla liczby; skala (pojedyncze pokoje, kilka-kilkanaście polubionych gier) czyni to nieistotnym kosztowo.

## 4. Rozszerzony pasek filtrów (`GenreFilterBar` → `TagFilterBar`)

### Zakres zmiany nazwy

Komponent przestaje być tylko-gatunkowy — zmiana nazwy pliku/eksportu `src/components/swipe/GenreFilterBar.tsx` → `src/components/swipe/TagFilterBar.tsx`, aktualizacja obu miejsc użycia (`SoloSwipeScreen.tsx`, `RoomExploreScreen.tsx`).

### Model danych: filtrowanie po `tags`, nie po `genres`

`matchesGenreFilter(arr: string[], selected: string[])` (`steamLibrary.ts`) jest już generyczna — sprawdza `selected.some(x => arr.includes(x))` bez założeń o nazwie pola. `tags` (kategorie+gatunki połączone, `parseSteamAppDetails`) to nadzbiór `genres`, więc **żadna nowa funkcja dopasowująca nie jest potrzebna** — wystarczy w obu `advance()` (SoloSwipeScreen, RoomExploreScreen) zamienić:
```ts
if (!matchesGenreFilter(data.genres ?? [], genreFilter)) continue;
```
na:
```ts
if (!matchesGenreFilter(data.tags ?? [], tagFilter)) continue;
```
(`tagFilter`/`genreFilter` — zmiana nazwy zmiennej stanu dla jasności, sam typ `string[]` bez zmian).

### Przypięte na stałe pigułki (zawsze pierwsze, przed gatunkami)

| Etykieta | `filterValue` (dopasowanie do `game.tags`) | Steam tag ID (do `/api/steam/discover`) |
|---|---|---|
| Kooperacja | `"Kooperacja"` | 1685 (zgodne, bez rozbieżności) |
| Multiplayer | `"Wieloosobowa"` (forma z kategorii Steama, potwierdzona w `matchesMultiplayerFilter`) | 3859 (`"Wieloosobowe"` w oficjalnej liście tagów — inna forma gramatyczna, ID i tak poprawne) |
| Nowości | *(brak — filtr daty, nie tag)* | *(brak — filtrowanie tylko klienckie, patrz niżej)* |
| Wkrótce | *(brak — filtr daty, nie tag)* | *(brak — filtrowanie tylko klienckie, patrz niżej)* |

### Filtr daty premiery — osobna kategoria, łączona przez AND

"Nowości"/"Wkrótce" to nie tagi Steama — liczone z `game.releaseDate` przez istniejącą, testowaną funkcję `daysUntil()` (`src/lib/releaseCountdown.ts`, już używaną w `ReleaseOrReviewsPanel`). Nowa funkcja `src/lib/releaseCountdown.ts`:

```ts
export function isRecentRelease(releaseDate: { comingSoon: boolean; date: string } | null, now: Date = new Date()): boolean {
  if (!releaseDate || releaseDate.comingSoon) return false;
  const days = daysUntil(releaseDate.date, now);
  return days !== null && days >= -60 && days <= 0;
}

export function isUpcomingSoon(releaseDate: { comingSoon: boolean; date: string } | null, now: Date = new Date()): boolean {
  if (!releaseDate || !releaseDate.comingSoon) return false;
  const days = daysUntil(releaseDate.date, now);
  return days !== null && days >= 0 && days <= 7;
}
```

Stan filtra rozszerza się o osobne pole (nie miesza się z listą tagów): `dateFilter: "none" | "new" | "soon" | "both"` — ale żeby uniknąć czwartego stanu i trzymać UI prostym (dwie niezależnie klikalne pigułki, tak jak reszta), prościej: `dateFilters: Set<"new" | "soon">` obok `tagFilter: string[]`. W `advance()`:

```ts
if (!matchesGenreFilter(data.tags ?? [], tagFilter)) continue;
if (dateFilters.size > 0) {
  const matchesDate =
    (dateFilters.has("new") && isRecentRelease(data.releaseDate)) ||
    (dateFilters.has("soon") && isUpcomingSoon(data.releaseDate));
  if (!matchesDate) continue;
}
```

Gra musi pasować do **conajmniej jednej** zaznaczonej daty (jeśli obie zaznaczone: nowe LUB nadchodzące) **ORAZ** do wszystkich innych warunków (multiplayer, tagi) — dokładnie zachowanie potwierdzone z użytkownikiem.

### Więcej popularnych tagów + wyszukiwarka

Pełna oficjalna lista tagów Steama (`GET https://store.steampowered.com/tagdata/populartags/polish`, zweryfikowana na żywo podczas brainstormingu: 432 wpisy `{tagid, name}`) zapisana jako statyczny plik danych **w repo** (nie fetch w runtime) — `src/lib/steamTagCatalog.ts`, `export const STEAM_TAG_CATALOG: { id: number; name: string }[]`.

- **Domyślnie widoczne dodatkowe tagi**: pierwsze ~15 wpisów z `STEAM_TAG_CATALOG` (kolejność własna Steama z endpointu "populartags" — ufamy jej zamiast ręcznie kurować), pomijając te już przypięte/gatunkowe, dołączone do paska za 8 gatunkami.
- **Wyszukiwarka**: ikona lupy na końcu paska (ten sam styl pigułki co reszta, `⌕`/`Search` z `lucide-react`). Kliknięcie rozwija w tym samym miejscu małe pole tekstowe (`bg-card border-border rounded-xl border px-3 py-1.5 text-xs`, spójne z resztą inputów apki). Wpisywanie filtruje `STEAM_TAG_CATALOG` po podłańcuchu nazwy (case-insensitive), do 5 dopasowań pokazanych jako klikalne pigułki pod polem. Kliknięcie dopasowania dodaje jego `name` do `tagFilter` (dokładnie jak kliknięcie zwykłej pigułki) i chowa wyszukiwarkę.

**Znane, świadomie zaakceptowane ograniczenie**: `STEAM_TAG_CATALOG` (kategorie sklepowe/tagi popularności) i `game.tags` (kategorie z `appdetails`) czasem różnią się gramatycznie dla tego samego pojęcia (potwierdzone: Strategie/Strategiczne, Symulacje/Symulatory, Wieloosobowa/Wieloosobowe — już znany wzorzec z Fazy Odkrywaj). Dla Kooperacji i Multiplayer zmapowane ręcznie (tabela wyżej). Dla pozostałych ~430 tagów z wyszukiwarki: zawsze poprawne dla źródła "Cały katalog Steam" (filtr po stronie Steama, ID zawsze trafny), ale pojedyncze przypadki mogą nie dopasować żadnej karty w bibliotece/wspólnej puli, jeśli akurat trafi się taka rozbieżność — nie budujemy pełnego słownika-mostu dla 432 tagów (YAGNI, nieproporcjonalny nakład).

### Rozszerzenie mapowania tag→ID dla Odkrywaj

`GENRE_TAG_IDS` (`src/lib/steam.ts`, 8 wpisów) zastąpione/rozszerzone o `resolveSteamTagId(filterValue: string): number | undefined`:

```ts
const TAG_ID_OVERRIDES: Record<string, number> = {
  Strategie: 9,
  Symulacje: 599,
  Wieloosobowa: 3859, // "Wieloosobowe" w oficjalnej liście, ID i tak poprawne
};

export function resolveSteamTagId(filterValue: string): number | undefined {
  return TAG_ID_OVERRIDES[filterValue] ?? STEAM_TAG_CATALOG.find((t) => t.name === filterValue)?.id;
}
```

`/api/steam/discover/route.ts` zamienia `GENRE_TAG_IDS[g]` na `resolveSteamTagId(g)` — reszta route'a bez zmian (nieznalezione tagi nadal cicho odfiltrowane, `filter((id): id is number => id !== undefined)`).

## Poza zakresem

- Filtr daty premiery po stronie Steama (server-side `sort_by`/zakres dat w `/api/steam/discover`) — tylko filtrowanie klienckie na start; wystarczające bo klient i tak jest ostatecznym źródłem prawdy (ten sam wzorzec co reszta filtrów w Odkrywaj).
- Pełny słownik gramatycznych wariantów tagów (kategorie ↔ populartags) dla wszystkich 432 tagów — świadomie odrzucone, opisane ograniczenie wyżej.
- Zmiana kolorów gdziekolwiek indziej niż wyświetlanie samego procentu opinii (confetti, plakietka swipe, kciuk recenzji) — zostają zielone/czerwone jak dziś.

## Weryfikacja

- `npm run build` + `npx vitest run` (konwencja repo). Nowe testy Vitest: `reviewScoreColorClass` (progi 39/40/69/70), `isRecentRelease`/`isUpcomingSoon` (granice -60/-61/0/1, 0/7/8).
- Ręczna: (1) gra z brakującym panelem mediów przed fixem pokazuje panel po odświeżeniu (natychmiast, nie po 30 dniach); (2) gry o różnych % opinii pokazują różne kolory; (3) nagłówek nie nachodzi na przełącznik motywu na wąskim ekranie; (4) licznik Polubionych w pokoju aktualizuje się na żywo; (5) Kooperacja/Multiplayer/Nowości/Wkrótce działają dla wszystkich trzech źródeł (biblioteka/wspólna/katalog); (6) wyszukiwarka tagów znajduje i dodaje dowolny tag z listy 432.
