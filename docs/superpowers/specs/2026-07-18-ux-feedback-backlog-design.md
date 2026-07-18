# UX Feedback Backlog — 11 poprawek zgłoszonych przez użytkownika (2026-07-18)

Data: 2026-07-18

## Kontekst

Zgłoszone jako lista "rzeczy przeszkadzających" do zrobienia na następnej sesji ("wake up"), nie do implementacji teraz. Ten dokument to wynik brainstormingu (rekonesans w kodzie + 4 pytania doprecyzowujące do użytkownika + jedno dogłębne dorekonesansowanie w trakcie) — spec-level decyzje, gotowe do przepuszczenia przez `writing-plans` na starcie następnej sesji. Nie jest to jeszcze plan zadaniowy z gotowym kodem.

Grupowanie w niezależne podprojekty (każdy może być osobnym cyklem spec→plan→implementacja, ale ten jeden dokument je wszystkie pokrywa na poziomie decyzji projektowych):

- **A. Uproszczenie startu/menu** — pkt 1, 8, 9
- **B. Pasek tagów** — pkt 2, 3
- **C. Nawigacja i koordynacja Versus** — pkt 4, 5, 6
- **D. Recenzje** — pkt 7
- **E. Czułość gestu swipe** — pkt 10 (zgłoszone jako dopisek w trakcie sesji)
- **F. "Porównaj biblioteki" jako guzik w trakcie gry** — dopisane w trakcie sesji, doprecyzowane 2 pytaniami

---

## A. Uproszczenie startu/menu

### A1 (pkt 1) — Usunięcie "Jak chcesz grać?" ze strony głównej

**Obecny stan** (`SoloSettingsScreen.tsx:113-116`): toggle Wszystkie/Jednoosobowe/Wieloosobowe (`MultiplayerFilter`) na ekranie startowym, przekazywany do `onLoadLibrary(source, profile, backlog, multiplayer)` → napędza `matchesMultiplayerFilter()` w `SoloSwipeScreen.tsx`/`RoomExploreScreen.tsx`. Osobno, `TagFilterBar.tsx` ma już przypięte na stałe pigułki "Kooperacja"/"Wieloosobowa" (`PINNED_TAGS`), filtrujące przez ten sam mechanizm tagów co reszta pigułek — **funkcjonalnie redundantne** z toggle'em na stronie głównej.

**Decyzja:** usunąć `MultiplayerFilter`/`MULTIPLAYER_OPTIONS`/toggle "Jak chcesz grać?" ze `SoloSettingsScreen.tsx` całkowicie. Filtrowanie solo/multi zostaje wyłącznie przez pigułki Kooperacja/Wieloosobowa w `TagFilterBar` podczas przeglądania. Wymaga przycięcia sygnatury `onLoadLibrary` (usunięcie parametru `multiplayer`) i wszystkich miejsc, które go dziś przyjmują domyślnie jako `"all"` (`SoloSwipeScreen.tsx` przyjmuje `multiplayerFilter` jako prop z góry — sprawdzić przy planowaniu, czy `matchesMultiplayerFilter`/`MultiplayerFilter` w `steamLibrary.ts` da się w ogóle usunąć, czy zostaje z dawnym filtrem biblioteki solo per-gra, tylko bez UI na starcie).

### A2 (pkt 8) — Czytelniejsze menu + ukryty input profilu

**Obecny stan** (`SoloSettingsScreen.tsx:93-136`): pole "Twój profil Steam" widoczne od razu, zawsze, niezależnie od tego czy user w ogóle chce przeglądać bibliotekę. Dwa przyciski "Eksploruj katalog"/"Eksploruj bibliotekę" bez wyjaśnienia różnicy.

**Decyzja:**
- Pole profilu Steam **ukryte domyślnie**, pojawia się dopiero po kliknięciu "Eksploruj bibliotekę" (ten sam wzorzec co istniejące `showCreate`/`showJoin` w tym samym pliku — `useState` boolean + warunkowe renderowanie).
- "Eksploruj katalog" zostaje jako przycisk działający od razu (nie wymaga profilu) — bez zmian w zachowaniu.
- Dodać krótki podpis pod każdym przyciskiem tłumaczący różnicę, np. pod "Eksploruj katalog": *"Przeglądaj cały Steam"*, pod "Eksploruj bibliotekę": *"Tylko gry, które już masz"*. Dokładne brzmienie do dopracowania przy implementacji.

### A3 (pkt 9) — Wyszukiwanie profilu Steam po nazwie (bez logowania)

**Rekonesans (potwierdzone na żywo, nie zakładanie):** pierwsza próba (`SearchCommunityAjax` z fałszywym `sessionid`) dała 401 — **błędnie zinterpretowane** jako "wymaga logowania". Po sprawdzeniu dokładniej: Steam wydaje **anonimowy** `sessionid` (cookie CSRF, nie sesja logowania) każdemu odwiedzającemu `steamcommunity.com`, nawet niezalogowanemu. Z prawdziwym anonimowym `sessionid` (pobranym przez zwykłe GET na `steamcommunity.com/search/users/`) + nagłówkami `Referer`/`X-Requested-With`, `SearchCommunityAjax?text=<query>&filter=users&sessionid=<token>` zwraca **200 z realnymi wynikami** (JSON z polem `html`: awatar, nazwa, link do profilu, SteamID64 w `data-miniprofile`) — zweryfikowane live curlem, zapytanie "gaben" zwróciło 70,746 dopasowań z prawdziwymi profilami. **Wykonalne bez OAuth/logowania**, zgodnie z architekturą projektu (brak logowania jest świadomą decyzją, zob. Faza A1).

**Zakres:**
- Nowa server-side funkcja w `src/lib/steam.ts` (albo nowy mały moduł, np. `src/lib/steamCommunitySearch.ts` — do ustalenia przy planowaniu, `steam.ts` ma dziś 294 linie, jest miejsce) — dwa kroki: (1) GET `https://steamcommunity.com/search/users/` żeby wyciągnąć świeży `sessionid` z `Set-Cookie` (bezstanowo, jedno zapytanie na wyszukiwanie — pasuje do architektury serverless Vercela, brak potrzeby cache'owania cookie między requestami), (2) GET `SearchCommunityAjax` z tym cookie + `Referer: https://steamcommunity.com/search/users/` + `X-Requested-With: XMLHttpRequest`.
- Parsowanie zwróconego `html` (regex, wzorem `parseDiscoverResults` w `steam.ts` — bez nowej zależności typu cheerio) na listę kandydatów: `{ steamId64 lub vanity, name, avatarUrl, profileUrl }`. Wystarczy wyciągnąć `data-miniprofile`, `searchPersonaName` link+tekst, `avatarMedium img src` przez regex — struktura HTML zweryfikowana w rekonesansie powyżej.
- Nowa API route `src/app/api/steam/find-profile/route.ts?q=<query>` (ten sam wzorzec co `search`/`details`/`discover`).
- UI: w polu "Twój profil Steam" (odsłoniętym po A2) — zamienić na wyszukiwarkę z debounce (wzorem istniejącego wyszukiwania tagów w `TagFilterBar` albo wyszukiwania gier w `AddGameForm`/`SoloLikedScreen`), pokazującą dropdown kandydatów (awatar+nazwa) do kliknięcia. Zostawić pod spodem alternatywę "albo wklej link do profilu" dla osób, które wolą wkleić bezpośrednio (nie usuwać starej ścieżki, tylko dodać nową jako domyślną).
- **Ryzyko do zaakceptowania:** to nieoficjalny mechanizm (tak jak reszta integracji Steama w tym projekcie) — działanie regexów na HTML strony wyszukiwania może się zepsuć przy redesignie strony Steam, tak samo jak Discover. Traktować jak resztę tych integracji (fallback na "brak wyników" jeśli parsowanie zawiedzie, nie wywalać całej apki).

---

## B. Pasek tagów (`TagFilterBar.tsx`)

### B1 (pkt 2) — Przewijanie na komputerze: strzałka w lewo + powrót na początek

**Obecny stan:** `scrollRef` div z `overflow-x-auto`, jeden przycisk `ChevronRight` (`scrollRight()`, `scrollBy({ left: 160 })`). **Brak jakiegokolwiek przycisku w lewo** — na komputerze bez trackpada/scrolla poziomego nie da się wrócić raz przewinięte tagi w prawo. Na telefonie działa dobrze (scroll dotykiem w obie strony natywnie).

**Decyzja (potwierdzona z użytkownikiem):**
- Dodać symetryczny przycisk `ChevronLeft` przed listą, analogiczny `scrollLeft()` (`scrollBy({ left: -160 })`).
- Dodatkowo osobny przycisk/ikona "na początek" — natychmiastowy skok do `scrollTo({ left: 0, behavior: "smooth" })`, niezależnie jak daleko się przewinęło (nie trzeba wielokrotnie klikać strzałki w lewo). Propozycja: mała ikona (np. `ChevronsLeft` z lucide-react, wizualnie odróżniona od pojedynczej strzałki) obok/zamiast lewej strzałki, albo dostępna przez long-press/double-click na strzałce w lewo — dokładne umiejscowienie do ustalenia przy implementacji (mało miejsca w rzędzie z 2 strzałkami + wyszukiwarką).
- Oba przyciski w lewo widoczne tylko na urządzeniach z myszką/bez dotyku (np. przez `hidden md:flex` — na telefonie i tak działa scroll dotykiem, dodatkowe przyciski to zbędny zaśmiecony UI). Prawy przycisk już dziś jest zawsze widoczny — do przemyślenia, czy analogicznie ograniczyć oba do desktopu przy planowaniu, czy zostawić jak jest (spójność > oszczędność miejsca).

### B2 (pkt 2) — Zaznaczone tagi przenoszą się na początek listy

**Decyzja:** `allPills` (dziś: `[...PINNED_TAGS, ...GENRE_PILLS, ...EXTRA_POPULAR_PILLS]`, statyczna kolejność) ma być dynamicznie sortowana: zaznaczone (`value.includes(pill.value)`) najpierw, reszta w dotychczasowej kolejności. Pigułki przypięte (`PINNED_TAGS`) **nie tracą swojego miejsca** gdy niezaznaczone — sortowanie dotyczy całej listy razem (zaznaczona pigułka z dowolnej sekcji przeskakuje na sam początek, przed nawet niezaznaczone przypięte), zgodnie z celem "łatwo zobaczyć co jest zaznaczone i łatwo odznaczyć" — priorytet na widoczność zaznaczenia, nie na hierarchię sekcji.

**Znaleziony przy okazji, powiązany gap:** tagi dodane przez wyszukiwarkę (`selectFromSearch`, spoza `PINNED_TAGS`/`GENRE_PILLS`/`EXTRA_POPULAR_PILLS`) **w ogóle nie pojawiają się jako pigułka** w pasku — są zaznaczone w stanie (`value`), ale niewidoczne, jedyny sposób ich odznaczenia to ponowne wyszukanie tej samej frazy. Naprawia się to niejako przy okazji B2, jeśli lista pigułek renderowana w pasku obejmie też "ad-hoc" wybrane tagi spoza stałych list (dociągnięcie nazwy/etykiety dla dowolnego tagu z `STEAM_TAG_CATALOG` po wartości `value`, doklejenie na początek jak reszta zaznaczonych). Warto zrobić w tym samym zadaniu, bo to ten sam kod (budowanie listy do wyrenderowania).

### B3 (pkt 3) — Tag "Popularne" jako alternatywa dla wpadania w ciąg DLC/niewydanych gier

**Zgłoszony problem:** przy przeglądaniu katalogu (szczególnie z filtrem Nowości/Wkrótce) łatwo trafić pod rząd na same DLC albo same niewydane jeszcze tytuły.

**Status: wymaga rekonesansu przed projektowaniem** (nie robić teraz, zaplanować na start następnej sesji jak przy Discover/HLTB). Do sprawdzenia na żywo:
- Czy odpowiedź Steam Store search results (`/search/results/`, już używana przez `fetchDiscoverPage`) niesie sygnał "czy to DLC" (np. typ produktu) możliwy do odfiltrowania regexem, tak jak dziś `data-ds-appid`/`data-ds-tagids`.
- Czy da się dodać osobny tag/pigułkę "Popularne" jako sortowanie po popularności (Steam ma domyślne sortowanie po popularności już w `storesearch`/discover — do zweryfikowania, czy obecny kod już z niego korzysta domyślnie, czy trzeba dograć parametr).
- Jeśli DLC-owe appid da się odróżnić, prosta poprawka: wykluczyć je domyślnie z katalogu (nie tylko pod nowym tagiem) — DLC w losowym przeglądaniu gier do wspólnej rozgrywki to prawie nigdy nie to, czego szuka się w tej apce.

---

## C. Nawigacja i koordynacja Versus

### C1 (pkt 4) — Brak powrotu z Versus (pokój) do Explore

**Obecny stan:** `VersusScreen.tsx` (trasa `/room/[code]/versus`) renderuje samo `EliminationRound` bez żadnego nagłówka/przycisku "Wstecz" — potwierdzone brakiem jakiegokolwiek `aria-label`/linku powrotnego w całym `EliminationRound.tsx`. Dla porównania, solo `LocalVersusScreen.tsx` ma nagłówek z przyciskiem "‹ Wstecz" (`onExit`) — pokojowa wersja tego nigdy nie dostała.

**Decyzja:** dodać identyczny nagłówek z przyciskiem "‹ Wstecz" do `VersusScreen.tsx` (link do `/room/{roomCode}`, ten sam wzorzec wizualny co `HistoryScreen.tsx`/`GamePoolScreen.tsx` — okrągły przycisk 34×34px z `‹`). Nie przerywa trwającej rundy — powrót do lobby, runda w Firestore zostaje (można wrócić do niej ponownie, orkiestracja `EliminationRound` już dziś wznawia istniejącą rundę przez `getActiveRound`).

### C2 (pkt 5) — Powiadomienie (nieblokujące) dla innych graczy o starcie Versus

**Obecny stan:** wejście w Versus to zwykły `<Link href="/room/{roomCode}/versus">` (`LikedScreen.tsx:70`) — czysto kliencka nawigacja, zero synchronizacji między uczestnikami. Gracz A może być już w Versus, gracz B nie ma pojęcia.

**Decyzja (potwierdzona z użytkownikiem — wariant nieblokujący, nie wymaga zgody wszystkich):** kliknięcie "Rozpocznij Versus" **od razu** przenosi klikającego (bez zmiany istniejącego zachowania), ale dodatkowo zapisuje sygnał do Firestore (nowe pole na dokumencie pokoju albo `session/state`, wzorem istniejących sygnałów minigier typu `activeFeature`) który inni uczestnicy subskrybują — pokazuje im toast/baner "X rozpoczyna Versus" z linkiem/przyciskiem "Dołącz". Nie blokuje, nie wymusza — czysto informacyjne. Dokładny kształt danych (pole na `rooms/{code}` czy osobny dokument `session/state`) do ustalenia przy planowaniu, prawdopodobnie najbliżej wzorca `activeFeature`.

### C3 (pkt 6) — "Przelosuj" po wyniku Versus

**Obecny stan:** `WinnerScreen.tsx` to czysty ekran wyniku — konfetti, okładka, tytuł, link do Steama. Zero interaktywności poza linkiem zewnętrznym.

**Decyzja (potwierdzona z użytkownikiem — pełny reroll, nie tylko powrót):** dodać przycisk "Przelosuj" na `WinnerScreen`, który **restartuje cały bracket na tej samej puli** (ta sama lista polubionych gier co przed ostatnim Versus), z zupełnie nowymi swipe'ami od rundy 1 — realna szansa na inny wynik. Wymaga:
- Solo (`useLocalVersus`/`LocalVersusScreen`): dodać funkcję resetu stanu (`pool` z powrotem do pełnej listy polubionych, `swipes`/`winner`/`tieBreak` wyczyszczone) — czysto lokalne, bez Firestore.
- Pokój (`EliminationRound`/`rooms.ts`): potrzebuje nowej funkcji analogicznej do `startRound`, która **nadpisuje** istniejącą zakończoną rundę (albo tworzy nową rundę/sesję z tym samym `initialPool`) — do ustalenia przy planowaniu, czy to nowy `sessionId` (czysty start, jak przy pierwszym wejściu) czy coś innego. **W pokoju przelosowanie wpływa na wszystkich uczestników** — prawdopodobnie wymaga tego samego traktowania co start Versus (C2: nieblokujące powiadomienie "X chce przelosować", każdy i tak zobaczy nową rundę przez realtime listener niezależnie od powiadomienia).

---

## D. Recenzje (pkt 7)

**Obecny stan:** `ReleaseOrReviewsPanel.tsx` pokazuje maks. 3 recenzje (`TOP_REVIEW_COUNT = 3` w `steam.ts`, `parseSteamAppDetails` zostawia tylko top 3 po `votes_up` z odpowiedzi Steama, która sama w sobie ma limit `num_per_page=10`).

**Decyzja:** zwiększyć `TOP_REVIEW_COUNT` do np. 10 (mieści się w istniejącym limicie zapytania do Steama, zero dodatkowych wywołań sieciowych) i cache'ować wszystkie 10 w `steam_cache` jak dziś. UI: pokazywać domyślnie 3 (bez zmiany obecnego wyglądu), dodać przycisk/strzałkę "Pokaż więcej recenzji" pod listą, która odsłania pozostałe już wczytane (czysto kliencki `useState` limit 3→10, zero nowego requestu). Prosta zmiana, mało ryzyka — kandydat do zrobienia jako pierwszy w kolejce następnej sesji.

---

## E. Czułość gestu swipe (pkt 10 — dopisane w trakcie sesji)

**Zgłoszony problem:** na telefonie, przewijanie w dół wewnątrz karty (żeby przeczytać opis gry) potrafi wywołać drganie/migotanie poświaty "Gramy"/"Pas" pod kartą — gest jest zbyt czuły na niewielki poziomy ruch towarzyszący pionowemu przewijaniu.

**Rekonesans (kod, nie zgadywanie):** `SwipeCard.tsx:55-59` — handler `useDrag` ustawia `x.set(mx); y.set(my)` **bezwarunkowo na każdej klatce gestu**, bez progu/blokady kierunku. Opis gry (`<div className="... overflow-y-auto ...">`, `SwipeCard.tsx:122`) jest **wewnątrz** tego samego draggable `motion.div` co cała karta — scrollowanie opisu i gest swipe nasłuchują na tym samym elemencie jednocześnie. `touchAction: "pan-y"` (linia 81) mówi przeglądarce "pionowy scroll obsłuż natywnie", ale @use-gesture i tak łapie każdy, nawet minimalny poziomy delta towarzyszący niedoskonale pionowemu ruchowi palca, natychmiast poruszając `x` → poświata (`likeOpacity`/`passOpacity`/`glowShadow`, progi już od ±24px) reaguje.

**Decyzja:** dodać blokadę kierunku (directional lock) w handlerze `useDrag` — reagować na ruch poziomy (`x.set(mx)`) tylko gdy `Math.abs(mx)` wyraźnie przeważa nad `Math.abs(my)` (np. `Math.abs(mx) > Math.abs(my) * 1.5` albo podobny margines do dobrania empirycznie), w przeciwnym razie zostawić `x` w spoczynku i przepuścić gest jako czyste przewijanie. Nie zmienia progu commitowania swipe'a przy puszczeniu (`decideSwipeDirection`, `SWIPE_DISTANCE_THRESHOLD`/`SWIPE_VELOCITY_THRESHOLD` w `swipeGesture.ts` zostają bez zmian) — dotyczy wyłącznie wizualnej reakcji W TRAKCIE przeciągania, nie logiki decyzji o swipe'ie. Zweryfikować ręcznie na telefonie po zmianie (Playwright touch emulation albo żywe urządzenie), że: (a) pionowe scrollowanie opisu już nie porusza poświatą, (b) celowy poziomy swipe nadal płynnie reaguje od razu.

---

## F. "Porównaj biblioteki" jako guzik w trakcie gry (dopisane w trakcie sesji)

**Doprecyzowane z użytkownikiem:** A2 zostaje bez zmian (pole profilu chowa się do kliknięcia "Eksploruj bibliotekę" — dopisek dotyczył czego innego). Nowa funkcja to **rozszerzenie istniejącego mechanizmu Co-op/Dodaj znajomego**, nie coś odrębnego.

**Obecny stan (już zbudowane, tylko źle wyeksponowane):**
- `RoomUpgradeButton.tsx` — pływający przycisk 🤝 "Co-op/Dodaj znajomego", już dostępny w dowolnym momencie przeglądania solo (`fixed bottom-6 left-4`) — tworzy pokój i pokazuje QR/kod do udostępnienia. Znajomy musi fizycznie dołączyć do pokoju i sam podać swój profil Steam (mechanizm nie pozwala "wyszukać" cudzej biblioteki bez ich udziału — trzeba mieć od nich dane owned-games z ich własnego wywołania Steam API).
- `SharedLibrarySection.tsx` — już liczy `computeSharedLibrary(participants)` i pokazuje "Gry, które macie wspólnie (N)" + przycisk "Dodaj do puli". Już ma częściowo żądaną logikę komunikatu: gdy `withLibrary.length < 2` (mniej niż 2 uczestników podało bibliotekę) **komponent po prostu się nie renderuje** (`return null`) — cicho, bez komunikatu. Gdy ≥2 podało bibliotekę ale zero wspólnych gier, pokazuje komunikat tekstowy (już zgodny z życzeniem).
- **Gap:** `SharedLibrarySection` renderowany jest dziś wyłącznie w `GamePoolScreen.tsx` (ekran ręcznej puli/lobby) — **nieobecny podczas aktywnego Explore/swipe**, czyli tam gdzie użytkownik faktycznie chce z niego skorzystać "w trakcie gry".

**Decyzja:**
1. Dodać dostęp do porównania bibliotek jako guzik/pigułkę widoczną podczas Explore w pokoju (`RoomExploreScreen.tsx`), nie tylko w `GamePoolScreen`. Dokładna forma (stały przycisk jak 🤝, czy pigułka w pasku obok filtrów) do ustalenia przy planowaniu — proponowany kierunek: przycisk otwierający ten sam panel co dziś `SharedLibrarySection`, ale z dwoma wynikami zamiast dzisiejszego cichego `return null`:
   - **≥2 uczestników z udostępnioną biblioteką:** panel jak dziś (lista wspólnych gier / komunikat "brak wspólnych") + opcja ustawienia źródła Explore na "tylko wspólne gry" (nowy filtr, analogiczny do istniejącego przełącznika źródła biblioteka/katalog).
   - **<2 uczestników z udostępnioną biblioteką:** zamiast ciszy, jawny komunikat "za mało graczy udostępniło profil Steam" + zachęta/link do zrobienia tego (skorzysta na tym A3 — wyszukiwanie po nazwie obniża tarcie przy podawaniu własnego profilu, więc więcej osób faktycznie to zrobi).
2. Nie wymaga zmian w `computeSharedLibrary`/modelu danych — czysto UI: przeniesienie/duplikacja dostępu do istniejącego mechanizmu + jawny komunikat zamiast `return null`.

---

## Priorytet wykonania (propozycja na start następnej sesji)

Grupowane wg realnego ryzyka/rozmiaru, nie wg numeracji zgłoszenia:

1. **Szybkie, niskiego ryzyka, wysoka wartość:** D (recenzje), C1 (powrót z Versus), B1 (strzałka w lewo + powrót na początek) — każde to zmiana w 1 pliku, brak niejasności projektowych.
2. **Średnie:** E (czułość gestu — wymaga ręcznej weryfikacji na telefonie), B2 (reorder + naprawa niewidocznych tagów z wyszukiwarki), A1+A2 (uproszczenie startu, kilka plików ale mechaniczne).
3. **Wymagają dodatkowego rekonesansu na starcie sesji:** B3 (Popularne — sygnały DLC/popularności do zweryfikowania na żywo), A3 (wyszukiwanie profilu — nowa integracja, żywa weryfikacja regexów na starcie jak przy Discover).
4. **Najwięcej ruchomych części (Firestore, wielu uczestników):** C2 (powiadomienie Versus), C3 (przelosowanie w pokoju), F (porównaj biblioteki w trakcie gry — zależy od A3 dla pełnej wartości) — dotykają synchronizacji między graczami, warto robić po tym jak reszta jest zamknięta i przetestowana. F warto robić po A3, nie przed.

## Related

- `work/active/Tumolec.md` — roadmapa Tumolec, Faza D i dalsze
- `src/components/swipe/TagFilterBar.tsx`, `src/components/solo/SoloSettingsScreen.tsx`, `src/components/room/{VersusScreen,EliminationRound,WinnerScreen,LikedScreen,RoomExploreScreen,SharedLibrarySection,GamePoolScreen}.tsx`, `src/components/solo/RoomUpgradeButton.tsx`, `src/components/swipe/SwipeCard.tsx`, `src/components/swipe/ReleaseOrReviewsPanel.tsx`, `src/lib/steam.ts` — pliki dotknięte przez poszczególne punkty
