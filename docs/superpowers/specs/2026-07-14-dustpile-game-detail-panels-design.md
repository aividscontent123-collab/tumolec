# Dustpile-inspired: panele szczegółów gry na ekranie swipe — Design

> Inspiracja: zrzut ekranu Dustpile (`Desktop/dustpile.png`) — layout 3-kolumnowy (trailer/screenshoty | karta gry | premiera/opinie).

## Cel

Wzbogacić ekran swipe (solo i pokój) o więcej informacji o grze widocznych bez opuszczania flow swipe'a: trailer, screenshoty, dane o premierze (nadchodzące gry) lub opinie Steam (wydane gry). Zastąpić dzisiejszy pełnoekranowy portret gry mniejszym, wycentrowanym obrazkiem z metadanymi jako tekst pod spodem — styl bliższy Dustpile niż obecnej estetyce "pełnoekranowa karta ze scrimem".

## Zakres

- **Oba tryby**: solo (`SoloSwipeScreen`) i pokój (`SwipeScreen`) — współdzielą `SwipeCard`, więc współdzielą też nowy layout.
- **Responsywnie**: telefon (domyślnie) = jedna kolumna, karta zawsze widoczna + 2 chipsy-akordeon ("Media"/"Info") rozwijające panele nad/pod kartą. Desktop (`lg:` i wyżej) = 3 kolumny widoczne naraz (`grid-cols-[340px_1fr_340px]`), jak na screenie referencyjnym.
- **Bez nowych zapytań sieciowych ani kluczy API** — wszystkie nowe dane pochodzą z pól `appdetails`, które Steam już zwraca w istniejącym wywołaniu (`fetchSteamGameDetails`), dziś częściowo ignorowanych.
- **Bez fejkowych statystyk** — Dustpile pokazuje własne dane (liczba obserwujących, "Hype: X/100", liczba graczy demo), których nie ma w oficjalnym Steam Store API. Te statystyki są świadomie pominięte, nie przybliżane sztucznie. Dla wydanych gier realny odpowiednik "popularności" to `total_reviews` (liczba recenzji Steam) — już dostępny.

## Poza zakresem (świadomie)

- Osobna trasa/URL per gra (`/game/[appid]`) — łamałaby flow swipe'a, YAGNI.
- Modal na tapnięcie karty jako główny mechanizm (odrzucony na rzecz stałych paneli/akordeonu — na desktopie ma być widoczne wszystko naraz, nie za klikiem).
- Lokalne Plinko zasilane tymi danymi — niezwiązane, osobny temat (patrz `work/active/Tumolec.md`, "Faza A2b — poza zakresem").
- Wishlist/"Dodaj do listy życzeń" jako akcja w aplikacji — to zwykły link do strony Steam gry (Steam sam obsługuje wishlist po zalogowaniu), nie integracja API.

## Warstwa danych

### `SteamCacheEntry` (`src/lib/steam.ts`) — rozszerzenie

Nowe pola parsowane z **tego samego** `appdetails`, które już wołamy w `fetchSteamGameDetails`:

```typescript
export type SteamCacheEntry = {
  // ...istniejące pola bez zmian...
  developers: string[];
  releaseDate: { comingSoon: boolean; date: string } | null;
  screenshots: string[];        // path_full URLs
  trailerHlsUrl: string | null;    // movies[0].hls_h264
  trailerThumbnail: string | null; // movies[0].thumbnail
  totalReviews: number;         // już liczone dziś (query_summary.total_reviews), dotąd nieeksponowane
};
```

`releaseDate` jest `null` gdy Steam nie zwraca `release_date` w ogóle (rzadkie, stare gry) — obsłużone jako przypadek brzegowy niżej.

Cache TTL i mechanizm (Firestore `steam_cache/{steamAppId}`, 30 dni, `firestore.rules` walidacja kształtu) — **bez zmian w architekturze**, tylko więcej pól w tym samym dokumencie. `firestore.rules` będzie wymagać rozszerzenia walidacji kształtu o nowe pola (ten sam wzorzec co istniejące pola).

### `SwipeGame` (`src/lib/types.ts`) — rozszerzenie analogiczne

Te same nowe pola, ten sam kształt co `SteamCacheEntry` (subset do UI, jak dziś).

### `src/lib/steam.ts` — parsowanie

`fetchSteamGameDetails` dodaje odczyt `data.developers`, `data.release_date`, `data.screenshots`, `data.movies[0]` z już istniejącej odpowiedzi `appdetails`. Brak nowych zapytań HTTP.

## Layout

### `GameDetailLayout` (nowy komponent, `src/components/swipe/GameDetailLayout.tsx`)

Otacza `SwipeCard` w `SoloSwipeScreen.tsx` i `SwipeScreen.tsx` (dwa miejsca użycia, ten sam layout).

```
grid grid-cols-1 lg:grid-cols-[340px_1fr_340px] gap-4
```

- Kolumna środkowa: zawsze `SwipeCard` (mechanika swipe'a nietknięta).
- Kolumny boczne: na desktopie zawsze renderowane obok karty. Na telefonie renderowane wewnątrz akordeonu sterowanego lokalnym stanem (`activePanel: "media" | "info" | null`), rozwijanego przez 2 chipsy nad kartą.
- Panel, dla którego nie ma danych (patrz "Przypadki brzegowe"), nie renderuje się wcale — na telefonie odpowiadający mu chip też znika.

### Przeprojektowana `SwipeCard` (`src/components/swipe/SwipeCard.tsx`)

Zmiana wizualna, mechanika gestu (`useDrag`, `framer-motion`, `decideSwipeDirection`, poświata przy przeciąganiu) **bez zmian**:

- Zdjęcie: ten sam portret co dziś (`steamLibraryPortraitUrl`/fallback `coverImageUrl`, bez zmiany źródła), ale zajmuje ~55-60% wysokości karty zamiast całej (`absolute inset-0`) — wycentrowane, z marginesem/zaokrągleniem własnym (nie na całą szerokość/wysokość karty), reszta karty pod spodem to zwykłe tło z metadanymi.
- Pod zdjęciem, na tle karty (nie na gradiencie nad zdjęciem): tytuł, `{rok} · {developers.join(", ")}` (rok wyciągnięty z `releaseDate.date` albo pominięty jeśli `releaseDate` jest `null`), tagi (bez zmian wizualnych), opis (`shortDescription`, już mamy, dziś nieużywany w karcie).
- Odznaka "X% Steam" **usunięta z karty** — recenzje przenoszą się w całości do `ReleaseOrReviewsPanel` (patrz niżej), gdzie jest miejsce na pełne dane zamiast samego procentu.
- Link "Szczegóły na Steam" — zostaje bez zmian (już jest, prowadzi do strony Steam).

### `MediaPanel` (nowy, `src/components/swipe/MediaPanel.tsx`)

- Jeśli `trailerHlsUrl` istnieje: `<video controls poster={trailerThumbnail}>` odtwarzający strumień HLS. **Zweryfikowane na żywym API (2026-07-14)**: współczesny Steam `appdetails` nie zwraca już bezpośredniego pliku mp4/webm, tylko manifesty HLS (`.m3u8`) i DASH (`.mpd`) — HLS gra natywnie tylko w Safari/iOS. Odtwarzacz używa `hls.js` (nowa zależność, ~30-60KB gzip) jako fallback wszędzie indziej (Chrome/Firefox/Android): jeśli `video.canPlayType("application/vnd.apple.mpegurl")` prawda → natywny `src` (Safari); inaczej `Hls.isSupported()` → `hls.loadSource()`+`attachMedia()`.
- Jeśli `screenshots.length > 0`: siatka miniatur pod trailerem (lub samodzielnie, jeśli brak trailera). Klik na miniaturę otwiera pełny rozmiar w prostym lightboxie (ten sam wzorzec overlay + `stopPropagation`, co istniejący `MiniGameLauncher`).
- Jeśli ani trailera, ani screenshotów: komponent zwraca `null`, `GameDetailLayout` go pomija, chip "Media" na telefonie się nie pokazuje.

### `ReleaseOrReviewsPanel` (nowy, `src/components/swipe/ReleaseOrReviewsPanel.tsx`)

Dwa warianty renderowane na podstawie `releaseDate`:

- **`releaseDate?.comingSoon === true`** → nagłówek "Przed premierą": data premiery (`releaseDate.date`, już sformatowana po polsku przez Steam), odliczanie dni (czysta funkcja `daysUntil(dateString: string): number | null`, patrz niżej), link "Dodaj do listy życzeń" → `https://store.steampowered.com/app/{steamAppId}` (prawdziwy link Steam, nie akcja w aplikacji).
- **`releaseDate === null || releaseDate.comingSoon === false`** → nagłówek "Opinie Steam": `reviewScorePercent`%, `reviewSummary`, `totalReviews` (liczba recenzji jako realny wskaźnik popularności — zastępuje fejkowych "obserwujących" z Dustpile).
- Brak hype score, brak licznika obserwujących, brak licznika graczy demo — te dane nie istnieją w Steam Store API i nie są przybliżane.

### `lib/releaseCountdown.ts` (nowy, czysta funkcja + test)

```typescript
export function daysUntil(dateString: string): number | null
```

Parsuje sformatowaną polską datę Steama (np. "17 lip 2026") na różnicę dni od dziś. Zwraca `null` jeśli parsowanie się nie powiedzie (nieoczekiwany format) — panel wtedy pokazuje samą datę tekstową bez liczby dni, nie crashuje.

## Przypadki brzegowe

| Sytuacja | Zachowanie |
|---|---|
| Brak `release_date` w danych Steama | `ReleaseOrReviewsPanel` pokazuje wariant "Opinie Steam" (traktowane jak gra wydana) |
| `daysUntil()` nie potrafi sparsować daty | Panel premiery pokazuje samą datę tekstową, bez liczby dni |
| Brak trailera i brak screenshotów | `MediaPanel` renderuje `null`, chip "Media" znika na telefonie |
| Tryb pokoju (wielu uczestników) | Każdy klient czyta ten sam `steam_cache/{steamAppId}` z Firestore — bez zmian w modelu danych pokoju, czysto UI |
| Stary wpis w `steam_cache` sprzed tej zmiany (bez nowych pól) | Traktowany jak brak danych (pola `undefined`) — panele chowają się tak samo jak przy braku danych, cache i tak odświeży się po 30 dniach TTL albo przy następnym zapytaniu o appid spoza cache |

## Testowanie

- `daysUntil()` — unit testy (Vitest, wzorzec `elimination.ts`/`history.ts`): poprawny format, format z nietypowym miesiącem, data w przeszłości (ujemna różnica → traktowana jak "już wydana"), nieparsowalny string → `null`.
- Reszta to komponenty prezentacyjne (`MediaPanel`, `ReleaseOrReviewsPanel`, przeprojektowana `SwipeCard`, `GameDetailLayout`) — bez unit testów, zgodnie z konwencją projektu dla komponentów czysto wizualnych (jak `CoinFlip3D`/`WheelCanvas`).
- Ręczna weryfikacja (Playwright, jak w poprzednich fazach): desktop (3 kolumny widoczne, wideo gra, lightbox screenshotów działa, panel premiery dla gry `coming_soon` i panel recenzji dla gry wydanej) + telefon (chipsy rozwijają/zwijają panele, karta zawsze widoczna i swipe'owalna).

## Related

- `work/active/Tumolec.md` — plan projektu, sekcja "Faza C" (HowLongToBeat, panel recenzji, statystyki) — ten spec realizuje część zakresu Fazy C (panel recenzji, media) wcześniej niż planowano, na bezpośrednią prośbę użytkownika po zobaczeniu Dustpile.
- `docs/superpowers/specs/2026-07-13-dustpile-inspired-solo-mode-design.md` — poprzednia inspiracja Dustpile (Faza A1, tryb solo), ten spec to kolejny krok tej samej inspiracji zastosowany do samego ekranu karty.
