# Explore → Polubione → Versus — Design

## Kontekst

Dotychczasowy przepływ Tumolec (solo i co-op) to: ręcznie wyszukaj i dodaj tytuł po nazwie do puli → gdy pula ma ≥2 gry, swipe + eliminacja rundowa (`resolveRound`, `RoundVoting`) → zwycięzca. Użytkownik chce dodatkowy, równoległy sposób budowania decyzji: **swobodne przeglądanie (Explore)** kandydatów — własnej biblioteki, wspólnej biblioteki uczestników pokoju, albo całego katalogu Steam — z filtrem gatunku, gdzie polubione gry lądują w osobnej kolekcji **Polubionych**, a dopiero z Polubionych (opcjonalnie dobitych ręcznie) startuje **Versus** — dokładnie dzisiejsza mechanika eliminacji rundowej, tylko uruchamiana na tym mniejszym, wyselekcjonowanym zbiorze zamiast na ręcznie budowanej puli.

Explore ma zastąpić domyślny ekran wejściowy (ustawienia solo / lobby pokoju) jako to, co widać najpierw. Stare ręczne dodawanie po tytule + zwykła pula **zostają bez zmian**, dostępne jako osobna zakładka/link — nic nie usuwamy.

Zakres zaakceptowany przez użytkownika w całości (biblioteka własna/wspólna + cały katalog Steam), ale to największy dotychczasowy projekt w Tumolec — realnie wieloetapowy jak Dustpile (A1→A2a→A2b), z jednym wyraźnie najbardziej niepewnym elementem (integracja z katalogiem Steam, sekcja 2c).

## Zakres

1. Model danych: `genres` oddzielone od `tags`, kolekcja Polubionych (Firestore w pokoju, localStorage solo)
2. Trzy źródła kandydatów do Explore: własna biblioteka, wspólna biblioteka, cały katalog Steam
3. Filtr gatunku (chipsy, tylko czyste `genres`)
4. Ekran Explore — swipe bez eliminacji, "zagram" zapisuje do Polubionych
5. Ekran Polubionych + start Versus
6. Versus w pokoju (reużycie istniejącej eliminacji) i Versus solo (nowy lokalny runner)
7. Explore jako domyślny ekran wejściowy, stara ścieżka jako zakładka

## 1. Model danych

**Rozdzielenie `genres` od `tags`**: dziś `parseSteamAppDetails` (`src/lib/steam.ts`) łączy `data.genres` i `data.categories` w jedno pole `tags` (z deduplikacją, Task 10/11). Dodajemy osobne pole:

```ts
genres: string[]  // WYŁĄCZNIE data.genres, bez kategorii
```

w `SteamCacheEntry` i `SwipeGame`. `tags` zostaje bez zmian (dalej używane przez `matchesMultiplayerFilter` i wyświetlane na karcie). Wymaga tego samego łańcucha zmian co poprzednie pola (`firestore.rules` — nowy klucz w `hasOnly` + walidacja typu `is list`, `rooms.ts` toPoolGame, solo `DetailsResponse`, `types.ts`, `demo/page.tsx`).

**Kolekcja Polubionych — pokój**: `rooms/{roomCode}/liked/{steamAppId}`, kształt analogiczny do `games/{steamAppId}`:

```
likedBy: string[]      // participantId tych, którzy polubili -- unia przez samo istnienie wpisu
addedAt: timestamp
```

Polubienie = `arrayUnion(participantId)` na `likedBy` (dokument tworzony przy pierwszym polubieniu). Odlubienie = `arrayRemove`. Ręczne dopisanie do Polubionych (z ekranu Polubionych, przed startem Versus) to ten sam zapis, tylko zainicjowany z UI wyszukiwania zamiast z karty Explore -- **dosłownie ten sam kod co dzisiejsze dodawanie do `games`, inny target**.

`firestore.rules`: nowy blok `match /liked/{steamAppId}` analogiczny do `games` -- `allow create/update` z walidacją kształtu (`likedBy` lista, `addedAt` timestamp), bez `allow delete: if false` tym razem, bo odlubienie musi móc usunąć uczestnika z `likedBy` (albo skasować dokument gdy `likedBy` staje się puste -- do ustalenia przy implementacji, które jest prostsze do wyrażenia w regułach).

**Polubione — solo**: `localStorage` klucz `tumolec:solo:liked` -- tablica `steamAppId[]`, tytuły/okładki doczytywane z `steam_cache` jak wszędzie indziej w solo. Spójne z resztą trybu solo (decyzje zostają w przeglądarce, zero Firestore).

## 2. Źródła kandydatów do Explore

### 2a. Własna biblioteka

Bez zmian względem dzisiejszego importu (`/api/steam/library`, Faza A1) -- ten sam filtr backlogu, ten sam leniwy fetch `appdetails` karta po karcie.

### 2b. Wspólna biblioteka (co-op)

Bez zmian względem `computeSharedLibrary` (Faza A2a) -- lista appid, które ma więcej niż jeden uczestnik pokoju.

### 2c. Cały katalog Steam ("Odkrywaj")

Nowy endpoint `src/app/api/steam/discover/route.ts`, server-side (jak reszta integracji Steam):

- Owija `https://store.steampowered.com/search/results/?query&tags=<id>&start=<n>&count=25&infinite=1` -- **jedyny endpoint w projekcie zwracający HTML zamiast JSON** (pole `results_html`), wymaga parsowania (`data-ds-appid` z każdego `<a>` w wyniku, np. przez `cheerio` -- nowa zależność, albo regex jeśli kształt HTML jest wystarczająco stabilny, do ocenienia przy implementacji).
- Paginacja przez `start`/`count`, "Explore" dociąga kolejną stronę gdy talia się kończy (infinite-scroll w duchu, nie jednorazowy pełny fetch).
- **Mapowanie nazwa-gatunku → ID tagu Steam**: Steam nie publikuje oficjalnej listy ID tagów. Zweryfikowane doświadczalnie podczas brainstormingu, że parametr `tags=<id>` realnie filtruje wyniki, ale **dokładne ID per gatunek trzeba wyznaczyć przy implementacji** -- najpewniejsza metoda: odpytać `/search/results/` dla kilku znanych gier danego gatunku i odczytać ich `data-ds-tagids`, znaleźć wspólny identyfikator odpowiadający nazwie gatunku widocznej w UI Steama. Nie zgadywać ID na sztywno bez weryfikacji (już złapany jeden fałszywy trop: `tags=122` nie jest RPG, mimo że bywa tak cytowane w części narzędzi community).
- Wyklucza z wyników gry już będące w bibliotece **bieżącego uczestnika** (jeśli podał profil) -- inaczej "Odkrywaj" pokazywałby gry już posiadane. W pokoju to filtr per-uczestnik (na bazie jego własnej, już znanej biblioteki), nie sumy wszystkich uczestników -- prostszy, endpoint nie musi znać całego stanu pokoju.

## 3. Filtr gatunku

Chipsy (reużycie `ToggleChip`/`ToggleGrid` z Fazy A1) oparte **wyłącznie na `genres`** (Akcja, Przygodowe, RPG, Strategia, Symulacje, Indie, Casual, Wyścigi, Sportowe...). Multiplayer/co-op zostaje osobnym, już istniejącym filtrem (`MultiplayerFilter`) -- nie miesza się z gatunkiem, dwa niezależne wymiary filtrowania jak dziś backlog+multiplayer.

- **Biblioteka własna/wspólna**: filtr sprawdzany leniwie przy leniwym pobieraniu `appdetails` każdej karty (ten sam wzorzec co `matchesMultiplayerFilter` w `advance()`) -- **bez liczników na żywo przy chipsach** (prefetch całej biblioteki dla policzenia byłby drogi i wolny, nikt o liczniki nie prosił).
- **Katalog Steam**: gatunek to bezpośrednio parametr `tags=<id>` zapytania do Steama (sekcja 2c) -- filtruje serwer, nie my.

## 4. Explore (swipe bez eliminacji)

Nowy ekran, reużywa istniejące `SwipeCard` + `GameDetailLayout` bez zmian wizualnych. Przyciski "Pomiń"/"Chcę zagrać" (istniejący `SwipeActionButtons`, etykiety już pasują).

- **"Chcę zagrać"** → zapis do Polubionych (sekcja 1) + następna karta.
- **"Pomiń"** → tylko następna karta, **nic nie zapisujemy**. Świadome uproszczenie (YAGNI): jeśli wrócisz do Explore tego samego źródła później, możesz zobaczyć tę samą, wcześniej pominiętą grę ponownie -- nie budujemy teraz pamięci "już ocenione, pomiń następnym razem".
- Licznik ❤️ z liczbą Polubionych widoczny na ekranie Explore (link/przycisk do ekranu Polubionych).

## 5. Ekran Polubionych + start Versus

Lista polubionych gier (okładka, tytuł, przycisk usuń -- `arrayRemove` z `likedBy` w pokoju / usunięcie z tablicy w localStorage solo). Pole wyszukiwania do ręcznego dopisania (reużycie komponentu z dzisiejszego ekranu puli `/room/[code]/pool`, inny target zapisu -- sekcja 1). Przycisk **"Rozpocznij Versus"**, aktywny od 2 gier (ten sam wzorzec co dzisiejsze "Dodaj co najmniej 2 gry" w puli).

Start Versus **nie czyści** kolekcji Polubionych (tak jak dzisiejsza pula też nie czyści się przy starcie eliminacji, gry zostają `active` aż do wyniku) -- można wrócić i uruchomić Versus ponownie na tym samym zbiorze.

## 6. Versus

### Pokój

Dokładnie dzisiejsza eliminacja rundowa -- **zero nowej logiki**. Jedyna zmiana: nowy `eliminationRounds` dokument tworzony z `poolAtStart` zbudowanym z appidów w `liked` (zamiast z `games` gdzie `status == "active"`, jak dziś robi zwykła pula). `RoundVoting`, `resolveRound`, ekran zwycięzcy -- bez zmian.

### Solo

Dziś tryb solo **nie ma** żadnej eliminacji/bracketu (tylko liniowy `advance()`). Nowy, lokalny (bez Firestore) runner rund eliminacji, wzorem lokalnych mini-gier z Fazy A2b (`useLocalCoinflip`/`useLocalWheel` -- ten sam algorytm co wersja pokojowa, ale stan w React zamiast w Firestore):

- Reużywa czystą funkcję `resolveRound(pool, swipes)` z `lib/elimination.ts` bez zmian -- to jest już w pełni framework-agnostyczna, testowana logika.
- Nowy komponent UI zbierający "swipe" lokalnie (jeden głos na grę na rundę, bo solo = jeden uczestnik) zamiast czytać z `eliminationRounds/{id}/swipes` w Firestore.
- Remis (`status: "tie-break"`) rozstrzygany tak samo jak dziś w pokoju -- deterministyczne sortowanie po `steamAppId` i ucięcie do dostępnych miejsc (`SwipeScreen.tsx:154-158`, oznaczone tam `TODO` żeby docelowo podłączyć prawdziwy rzut monetą/koło). **Nie naprawiamy tego długu teraz** -- solo Versus dostaje to samo zachowanie co pokój, żeby oba tryby były spójne; realne podłączenie coinflip/koła do tie-breaku to osobna, mała poprawka do zrobienia kiedyś w obu miejscach naraz.

## 7. Explore jako domyślny ekran wejściowy

- **Solo** (`src/app/page.tsx` / `SoloSettingsScreen`): domyślny widok zamienia się na wybór źródła (własna biblioteka / cały katalog) + filtr gatunku + multiplayer, prowadzący prosto do Explore. Stary formularz "Stwórz pokój"/"Mam kod pokoju" zostaje (Faza A1 już to ustaliła), dochodzi link do starego ręcznego trybu (paczki/wyszukiwanie po tytule) jako osobna, dalej w pełni działająca ścieżka.
- **Pokój** (lobby): domyślny widok to Explore (źródło: wspólna biblioteka / cały katalog + filtr), z linkiem do dzisiejszego ekranu puli (`/room/[code]/pool`) jako alternatywy -- nic tam nie zmieniamy.

## Poza zakresem (YAGNI -- mapa drogowa)

- Pamiętanie "pominiętych" w Explore między sesjami (sekcja 4) -- jeśli okaże się uciążliwe w praktyce, dorzucić później.
- Prawdziwy coinflip/koło jako tie-breaker eliminacji (dziś deterministyczny placeholder, dług nienaprawiany teraz w żadnym trybie) -- osobna, mała poprawka.
- Liczniki na żywo przy chipsach gatunków dla bibliotek (sekcja 3) -- wymagałby prefetchu całej biblioteki, nie proszony.
- Tryb "Match co-op" / "Sprytna kolejność" / "Pomóż mi wybrać" (Faza D z mapy drogowej Dustpile) -- inteligentne tryby sugestii, osobna decyzja na przyszłość.
- Mutualne głosowanie "obaj muszą kliknąć to samo" podczas Explore w co-opie -- rozstrzygnięte podczas brainstormingu na rzecz niezależnego lubienia + wspólnej puli w Versus (prostsze, brak czekania jednego gracza na drugiego).

## Weryfikacja

- `npm run build` + `npx vitest run` po każdej grupie zadań (konwencja repo).
- Nowa logika czysta testowana Vitest: rozdzielenie `genres`, ewentualny parser HTML katalogu (jeśli da się wydzielić czystą funkcję parsującą z samego fetchowania).
- `/api/steam/discover`: ręczny test z realnym zapytaniem (kilka gatunków, potwierdzenie że wyniki faktycznie pasują do gatunku -- nie ufać ID tagu bez wizualnej weryfikacji nazw zwróconych gier).
- Explore solo i co-op: ręczny test end-to-end (Playwright) -- polubienie karty trafia do Polubionych, licznik się aktualizuje, ręczne dopisanie działa, "Rozpocznij Versus" tworzy poprawną rundę eliminacji na właściwym zbiorze gier.
- Versus solo: ręczny test pełnego przebiegu rund (w tym remisu) bez Firestore, potwierdzenie zwycięzcy.
- Stara ścieżka (ręczna pula + eliminacja): regresja -- upewnić się, że nadal działa niezmieniona po przełączeniu domyślnego ekranu na Explore.
