# HowLongToBeat — badge czasu przejścia (Main Story) na karcie swipe

Data: 2026-07-18

## Kontekst

Faza C roadmapy Tumolec (`work/active/Tumolec.md`) grupowała trzy rzeczy: integrację HowLongToBeat, panel recenzji i strony Statystyki/Osiągnięcia. Panel recenzji Steam już istnieje (`ReleaseOrReviewsPanel.tsx`, 2026-07-15/16) — z Fazy C zostają dwa niezależne kawałki. Ten spec obejmuje wyłącznie pierwszy: **HowLongToBeat**. Statystyki/Osiągnięcia to osobny, następny spec.

Zakres doprecyzowany z użytkownikiem: mały badge czasu przejścia bezpośrednio na karcie swipe (nie osobny panel szczegółów), pokazujący tylko kategorię "Main Story", cicho ukryty gdy brak dopasowania.

## Rekonesans (przed projektowaniem, nie zakładanie)

HowLongToBeat, w przeciwieństwie do Steama, **nie ma stabilnego publicznego endpointu**. Bezpośrednie uderzenie w `POST https://howlongtobeat.com/api/search` (wzorowane na strukturze znanej z community) zwróciło **404** — strona jest teraz zbudowana na Next.js/Turbopack z haszowanymi nazwami chunków JS (`_next/static/chunks/1knrxcebl5umx.js` itd.), więc realny adres API trzeba by okresowo wyciągać z bundla. To odwrotność sytuacji ze Steam Discover (2026-07-16), gdzie stabilny, znany endpoint pozwolił uniknąć zależności (`regex` zamiast `cheerio`).

Wniosek: zamiast własnego scrapera, używamy gotowego, utrzymywanego pakietu **`howlongtobeat`** (ckatzorke, 173 commity, npm `1.8.0`) — sam nadąża za zmianami strony. Kompromis: dokłada 4 zależności tranzytywne (`axios`, `cheerio`, `fast-levenshtein`, `user-agents`), CommonJS. Alternatywa `howlongtobeat-core` (nowszy, dynamiczne wykrywanie endpointu) odrzucona jako zbyt świeża/mało sprawdzona (3 gwiazdki).

## Zakres

- Nowe pole `hltbMainStory: number | null` (godziny, zaokrąglone) doklejone do istniejącego `steam_cache/{steamAppId}` — **żadnej nowej kolekcji Firestore**.
- Pobierane przy tym samym odświeżeniu co dane Steama (`/api/steam/details`), tym samym TTL 30 dni.
- Wyświetlane jako mały pill na karcie swipe (`SwipeCard.tsx`) — jedyne miejsce UI w tym specu. Brak osobnego panelu, brak Main+Extra/Completionist.
- Brak wyniku z HLTB (0 trafień wyszukiwania lub błąd sieci/parsowania) → `hltbMainStory: null` → badge po prostu się nie renderuje. Zero dodatkowej logiki progu pewności ponad to, co already zwraca ranking pakietu (bierzemy pierwszy/najlepiej dopasowany wynik).

## Nowy moduł `src/lib/hltb.ts`

Server-only (jak `steam.ts` — komentarz nagłówkowy o tym samym ograniczeniu, ten pakiet też nigdy nie trafia do bundla klienta, wołany wyłącznie z API route).

```ts
import { HowLongToBeatService, type HowLongToBeatEntry } from "howlongtobeat";

/** Czysta funkcja wyboru -- testowalna bez sieci, wzorzec jak
 * parseSteamAppDetails w steam.ts. Pakiet już sortuje wyniki po trafności,
 * bierzemy pierwszy. */
export function pickMainStoryHours(results: HowLongToBeatEntry[]): number | null {
  const best = results[0];
  if (!best || !best.gameplayMain || best.gameplayMain <= 0) return null;
  return Math.round(best.gameplayMain);
}

export async function fetchHltbMainStory(title: string): Promise<number | null> {
  try {
    const service = new HowLongToBeatService();
    const results = await service.search(title);
    return pickMainStoryHours(results);
  } catch {
    return null;
  }
}
```

`fetchHltbMainStory` nigdy nie rzuca — błąd sieci/parsowania degraduje do `null`, tak samo jak brak wyników.

## Zmiana w `steam.ts`

`SteamCacheEntry` dostaje:

```ts
hltbMainStory: number | null;
hltbCachedAt: number | null;
```

`parseSteamAppDetails` (czysta funkcja) **nie** dostaje tych pól — HLTB to osobne, niezależne wywołanie sieciowe (inny serwis, inny czas odpowiedzi), nie część parsowania odpowiedzi Steama. Pola te ustawia wyłącznie route.

## Zmiana w `/api/steam/details/route.ts`

Rozszerzenie istniejącej bramki kompletności cache'u (dziś: `hasMediaFields` sprawdza `screenshots`) o analogiczny check `hasHltbField = Object.prototype.hasOwnProperty.call(data, "hltbMainStory")`. Brakujące pole (stare wpisy sprzed tej zmiany) wymusza pełny refetch przy najbliższym odczycie — ten sam wzorzec co przy dodaniu `screenshots`/`trailerHlsUrl`.

Przy pełnym refetchu (nowa gra albo `!isFresh || !hasMediaFields || !hasHltbField`): `fetchHltbMainStory` przyjmuje tytuł gry, a nie appid, więc musi zaczekać na wynik `fetchSteamGameDetails` (który zwraca `name`) — wywołania są **sekwencyjne, nie równoległe**. HLTB nie jest na krytycznej ścieżce czasowej UI (badge doładowuje się jak reszta pól przez realtime listener na `steam_cache`), więc dodatkowe ~1-2s nie jest problemem:

```ts
const fresh = await fetchSteamGameDetails(steamAppId);
const hltbMainStory = await fetchHltbMainStory(fresh.name); // nigdy nie rzuca, patrz hltb.ts
await setDoc(cacheRef, { ...fresh, hltbMainStory, hltbCachedAt: Date.now() });
```

## Zmiana w `types.ts` i miejscach budujących `SwipeGame`

`SwipeGame` dostaje `hltbMainStory: number | null`. Ponieważ `SwipeGame` jest strukturalnym podzbiorem `steam_cache` i miejsca konsumujące dokument (m.in. `RoomExploreScreen.tsx`, `SoloSwipeScreen.tsx`, `SoloHome.tsx`, `EliminationRound.tsx`, `RoomTieBreaker.tsx`, `LocalVersusScreen.tsx`, `SoloTieBreaker.tsx`, `SoloLikedScreen.tsx`, `MediaPanel.tsx`, `WinnerScreen.tsx`) czytają pola z dokumentu Firestore — dokładny inwentarz miejsc wymagających dopisania pola należy do planu implementacji, nie do tego specu.

## Zmiana w `SwipeCard.tsx`

Mały pill z ikoną zegara (`lucide-react`, już używane w projekcie, np. `Clock`) w dolnym rogu okładki (górne rogi zajęte przez animowane etykiety "Gramy"/"Pas"), treść `~{hltbMainStory}h`. Renderowany wyłącznie gdy `game.hltbMainStory != null`:

```tsx
{game.hltbMainStory != null && (
  <div className="bg-card/90 absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
    <Clock className="h-3 w-3" />
    ~{game.hltbMainStory}h
  </div>
)}
```

Dokładne klasy/pozycjonowanie do dopracowania w implementacji — powyższe to szkic zgodny z istniejącym stylem karty.

## Świadomie poza zakresem

- Main + Extra, Completionist — tylko Main Story teraz.
- Osobny panel szczegółów HLTB (obok `ReleaseOrReviewsPanel`) — odłożone.
- Próg pewności dopasowania ponad ranking samego pakietu — brak dodatkowej logiki (np. porównania stringów Levenshteinem, mimo że pakiet ma tę zależność wewnętrznie).
- Backfill istniejących `steam_cache` dla gier już obejrzanych — dzieje się organicznie przy najbliższym odczycie (jak przy `screenshots`), bez osobnego skryptu migracyjnego.
- Statystyki/Osiągnięcia (reszta Fazy C) — osobny spec.

## Testy

- `hltb.test.ts`: `pickMainStoryHours` — pusta lista → `null`; jeden wynik z `gameplayMain` → zaokrąglona liczba; `gameplayMain: 0`/`undefined` → `null`. Wzorzec jak `steam.test.ts` (testy czystej funkcji parsującej, bez sieci).
- Brak testów integracyjnych uderzających w prawdziwe HLTB (jak reszta projektu nie testuje realnych wywołań Steama).
- Weryfikacja end-to-end ręczna (Playwright na dev-serwerze): karta znanej, popularnej gry (np. Hades) pokazuje sensowny badge; karta gry bez dopasowania (np. bardzo nowy/niszowy tytuł) nie pokazuje nic i nie crashuje.

## Related

- `work/active/Tumolec.md` — roadmapa, Faza C
- `src/lib/steam.ts`, `src/app/api/steam/details/route.ts` — wzorzec cache'u i bramki kompletności (`hasMediaFields`)
- `src/components/swipe/ReleaseOrReviewsPanel.tsx` — istniejący, sąsiadujący panel kontekstowy karty (recenzje/odliczanie do premiery)
