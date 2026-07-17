# Odkrywaj — dedup, prawdziwa losowość i ujednolicony upgrade do pokoju

Data: 2026-07-17

## Kontekst

Dwa zaległe punkty z backlogu Tumolec (zgłoszone 2026-07-17, `work/active/Tumolec.md`), potwierdzone i doprecyzowane w tej sesji:

1. **Odkrywaj pokazuje powtórki i zawsze te same popularne gry na start** (np. Counter-Strike zawsze pierwszy) — użytkownik chce pełnej losowości, żeby trafiać na ukryte perełki, nie tylko bestsellery.
2. **Guzik "podnieś sesję solo do pokoju" istnieje tylko dla źródła "biblioteka"** (wymaga podanego profilu Steam) — przy źródle "Eksploruj katalog" nie ma żadnego sposobu na zaproszenie znajomego bez utraty postępu (polubionych gier).

## Część A — Dedup + prawdziwa losowość

### Dedup

`SoloSwipeScreen.advance()` (`src/components/solo/SoloSwipeScreen.tsx`) i `RoomExploreScreen.advance()` (`src/components/room/RoomExploreScreen.tsx`) mają niemal identyczną logikę zaciągania kolejnych kart z `/api/steam/discover`. `excludeSetRef` w obu jest dziś inicjalizowany wyłącznie appidami gier, które gracz już posiada (dla źródła catalog) — nigdy nie jest uzupełniany appidami gier już **pokazanych** w bieżącej sesji. Jeśli ranking Steama przesunie się między kolejnymi zapytaniami o kolejne strony (nowe gry, zmiana sprzedaży), ten sam appid może wrócić na innej stronie.

**Fix:** w obu `advance()`, tuż przed `setCurrentCard(...)`, dopisz `candidate.appId` do `excludeSetRef.current`. Filtr `fresh = page.results.filter((r) => !excludeSetRef.current.has(r.appId))` przy kolejnych stronach automatycznie odrzuci powtórkę.

### Prawdziwa losowość

Dziś `fetchDiscoverPage(tagIds, start)` (`src/lib/steam.ts`) zawsze zaczyna od `start=0` przy pierwszym fetchu sesji, a Steam bez jawnego sortowania zwraca domyślnie Top Sellers — stąd te same, najpopularniejsze tytuły na początku każdej sesji.

**Fix (Approach 1 — losowy start po stronie serwera + tasowanie strony):**

- `/api/steam/discover/route.ts` przyjmuje nowy opcjonalny param `random=1`.
- Gdy obecny, `fetchDiscoverPage` (nowy wariant/parametr, np. `fetchDiscoverPage(tagIds, start, { randomize: true })`):
  1. Robi jedno dodatkowe, lekkie zapytanie do Steama z `count=1` (te same `tagIds`), żeby odczytać `total_count` dla aktualnego filtra.
  2. Losuje offset wyrównany do rozmiaru strony: `randomStart = Math.floor(Math.random() * Math.max(0, Math.floor((total_count - PAGE_SIZE) / PAGE_SIZE) + 1)) * PAGE_SIZE` (PAGE_SIZE = 25). Gdy `total_count <= PAGE_SIZE`, `randomStart = 0`.
  3. Pobiera prawdziwą stronę wyników od `randomStart` (normalny `fetchDiscoverPage` z tym startem).
  4. Tasuje (Fisher-Yates) kolejność 25 wyników tej strony.
  5. Zwraca `{ results, hasMore, start: randomStart }` — `start` dodany do istniejącego kształtu odpowiedzi, żeby klient wiedział, od którego realnego offsetu kontynuować.
- Klient (oba ekrany, `SoloSwipeScreen` i `RoomExploreScreen`) woła `/api/steam/discover?...&random=1` **tylko przy pierwszym fetchu nowej sesji przeglądania** (mount dla source=catalog, oraz w efekcie resetującym pulę po zmianie `genreFilter`/`genres` — dokładnie tam, gdzie dziś `discoverStartRef.current = 0`). Odpowiedź inicjalizuje `discoverStartRef.current = response.start + response.results.length` zamiast zakładać ciągłość od 0. Kolejne strony tej samej sesji (`fetchNextDiscoverPage` przy wyczerpaniu bieżącej puli) wołają już bez `random=1`, sekwencyjnie od zapamiętanego `discoverStartRef.current`.
- Pusta strona przy losowym starcie (skrajny przypadek bardzo wąskiego filtra + niefortunny offset) jest już obsłużona istniejącą ścieżką `discoverExhaustedRef.current = true` → ekran "to wszystkie gry pasujące do filtrów". Świadomie bez dodatkowego fallbacku na start=0 w v1 — jeśli w praktyce okaże się to częste, prosty follow-up.

**Poza zakresem:** rozszerzanie na inne endpointy, cache'owanie losowego startu między sesjami, sortowanie inne niż tasowanie w obrębie jednej strony.

## Część B — Ujednolicony "Co-op / Dodaj znajomego"

### Dzisiejszy stan

`SoloSwipeScreen.tsx` renderuje guzik "Co-op / Dodaj znajomego" i formularz z pseudonimem tylko gdy `props.source === "library"`. `handleUpgradeToCoop` bierze **całą** przefiltrowaną pulę biblioteki (`props.pool.map(g => g.steamAppId)`) i wrzuca ją do trwałej puli pokoju (`hydrateAndAddGamesToPool`), lądując w zwykłym lobby pokoju (`/room/{code}`).

Dla źródła `"catalog"` nie ma odpowiednika — nie da się "wrzucić całego Steama" do trwałej puli. Backlog jasno wskazuje, że oczekiwany efekt to: przenieś polubione gry i pozwól kontynuować wspólne Eksploruj, nie zrzuć całego katalogu do puli.

### Nowe zachowanie (jednolite dla obu źródeł)

1. **Nowy komponent** `RoomUpgradeButton` (np. `src/components/solo/RoomUpgradeButton.tsx`), renderowany zawsze obok `MiniGameLauncher` w `SoloSwipeScreen`, niezależnie od `source`. Zastępuje dzisiejszy top-barowy guzik/formularz widoczny tylko dla biblioteki (ten kod zostaje usunięty z `SoloSwipeScreen.tsx`, przeniesiony/przepisany w nowym komponencie).
2. **Przed utworzeniem pokoju:** mały guzik → rozwija inline formularz z pseudonimem → submit:
   - `createRoom(...)` + `joinRoom(code, id, nickname, source === "library" ? libraryAppIds : undefined)` (bez zmian względem dzisiejszego zachowania dla biblioteki — `steamLibraryAppIds` nadal potrzebne do "wspólnej biblioteki" w pokoju).
   - Przenosi lokalnie polubione gry: dla każdego `steamAppId` z `getLocalLiked()` woła `likeGame(code, steamAppId, id)`. Zakłada, że `steam_cache` już ma wpis (gry trafiły do polubionych dopiero po przejściu przez `/api/steam/details` w `advance()`, więc cache istnieje).
   - Zapisuje bieżący `genreFilter` do `setExploreGenreFilter(code, genreFilter)`, żeby pokój od razu dziedziczył filtr z sesji solo.
   - `localStorage.setItem` dla `participantId`/`nickname` (jak dziś).
   - `router.push(`/room/${code}/explore?source=${props.source}&autostart=1`)`.
3. **`RoomExploreScreen` — obsługa autostartu:** nowy odczyt `useSearchParams()` (`source`, `autostart`). Gdy `autostart=1` i `source` obecny, komponent pomija ekran wyboru źródła/"Zacznij przeglądać" i sam wywołuje `handleStart()` z `source` ustawionym z parametru (zamiast domyślnego `"shared"`) zaraz po zamontowaniu i po tym jak `participantId` jest znany. Bez parametru — zachowanie bez zmian (ekran startowy jak dziś), więc znajomy dołączający później nadal widzi normalny wybór.
4. **Po utworzeniu pokoju:** ten sam guzik (stan lokalny w `RoomUpgradeButton`, nie routing — host zostaje na ekranie Eksploruj) zamienia się w widget "jak dołączyć": QR + kod pokoju + `Udostępnij`. Logika (`QRCode.toDataURL` na stały URL produkcyjny + `navigator.share`/clipboard fallback) jest dziś zaszyta w `RoomLobby.tsx` — zostaje wyciągnięta do małego reużywalnego hooka/komponentu (np. `useRoomShare(roomCode)` albo `RoomJoinInfo`), używanego przez `RoomLobby` (zastępuje dzisiejszy inline kod, bez zmiany zachowania) i nowy `RoomUpgradeButton`.

### Świadomie poza zakresem

- **Historia "pokazanych, ale niepolubionych" gier z sesji solo nie jest przenoszona** do pokoju (ani `excludeSetRef`, ani pozycja kursora). Tylko polubione gry (`rooms/{code}/liked`) i filtr gatunku się przenoszą. Nowy uczestnik dołączający później zaczyna przeglądanie od zera; host może teoretycznie zobaczyć ponownie grę, którą wcześniej sam solo odrzucił — zaakceptowane jako uproszczenie, bo teraz decyzję podejmuje już dwoje graczy.
- Zmiana zachowania biblioteki poza samym przeniesieniem miejsca guzika: **brak**. `steamLibraryAppIds` nadal przekazywane przy `joinRoom`, więc "wspólna biblioteka" w pokoju (`computeSharedLibrary`) działa tak jak dziś — jedyna różnica to docelowy ekran (`/explore` zamiast `/room/{code}` lobby) i to, że do puli trafiają tylko polubione, nie cała biblioteka.
- Multiplayer filter (`multiplayerFilter` z sesji solo) **nie jest przenoszony** — `RoomExploreScreen` zawsze startuje z własnym domyślnym `multiplayer = "multi"`, niezależnie od tego, jaki filtr host miał ustawiony solo. To ustawienie dotyczy pokoju (gra dla ilu osób), więc domyślne "wieloosobowe" jest sensowniejszym startem dla co-opu niż przenoszenie filtra solo. Ponieważ `autostart=1` pomija ekran wyboru, host nie ma jak zmienić tego przed startem — może za to wrócić (`‹`) i wystartować ponownie z innym ustawieniem. Zaakceptowane jako świadome uproszczenie v1.

## Testy

- `fetchDiscoverPage`/route z `randomize: true`: `start` zwrócony mieści się w `[0, total_count - PAGE_SIZE]` i jest wielokrotnością 25; gdy `total_count <= PAGE_SIZE`, `start === 0`. Tasowanie: zdeterminizowany test z zamockowanym `Math.random` weryfikujący, że kolejność wyników się zmienia względem nieotasowanej odpowiedzi.
- Dedup: bez dedykowanego testu jednostkowego — to jednolinijkowa zmiana wewnątrz stanu komponentu (`excludeSetRef.current.add(...)` tuż przed `setCurrentCard`), wydzielanie jej do osobnej testowalnej funkcji byłoby nadmiarową abstrakcją dla jednej linijki. Weryfikacja ręczna przez Playwright (patrz niżej).
- `RoomUpgradeButton`/przeniesienie polubionych: nie testowane jednostkowo (integracja z Firestore) — weryfikacja ręczna przez Playwright na dev-serwerze (source=catalog i source=library), zgodnie z konwencją tego projektu dla przepływów Firestore.

## Related

- `work/active/Tumolec.md` — pełna roadmapa i historia projektu
- `docs/superpowers/specs/2026-07-16-explore-v2-design.md` — poprzedni spec wprowadzający Odkrywaj (katalog jako trzecie źródło)
- `docs/superpowers/specs/2026-07-15-explore-liked-versus-design.md` — spec wprowadzający Explore→Polubione→Versus i `rooms/{code}/liked`
