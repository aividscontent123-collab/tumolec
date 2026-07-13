# Tryb solo w stylu Dustpile — Faza A: Design

## Kontekst

Użytkownik znalazł https://dustpile.dumbbellgames.com/ ("Tinder for your Steam backlog") i chce, żeby Tumolec miał te same funkcje, ale pod własną marką i wizualnie lepiej. Reverse-engineering (Playwright, ekran ustawień + rzeczywisty ekran swipe'a) pokazał, że Dustpile to dużo większy produkt niż sugerował sam ekran startowy: import całej biblioteki Steam, filtry backlogu, chipsy gatunkowe z licznikami, dane HowLongToBeat, panel recenzji, 5-przyciskowy pasek akcji, tryby losowania ("Szczęśliwy traf", "Match co-op", "Sprytna kolejność", "Pomóż mi wybrać"), statystyki/osiągnięcia, rodzina/połączone biblioteki.

Pełny zakres 1:1 jest zaakceptowany przez użytkownika, ale rozbity na fazy (jak reszta Tumolec ma Fazy 0–5) — każda faza to osobny spec+plan+swarm, testowana przed startem następnej. **Ten dokument opisuje wyłącznie Fazę A** — funkcjonalny rdzeń + system wizualny. Fazy B/C/D są szkicowane w sekcji "Poza zakresem" jako mapa drogowa, nie do zaimplementowania teraz.

Po drodze użytkownik zmienił rdzeń przepływu Tumolec: aplikacja ma być domyślnie **solo**, z opcją "Co-op / Dodaj znajomego" podnoszącą sesję do współdzielonego pokoju (reużywając istniejący mechanizm kodu/linku/QR z Fazy 5) i pozwalającą budować pulę z części wspólnej bibliotek Steam uczestników.

## Zakres Fazy A

1. Import biblioteki Steam (solo i per-uczestnik w pokoju)
2. Filtry: backlog (nigdy nie grane / <2h / <10h / porzucone 2–10h) + solo/multiplayer
3. Przepływ solo → co-op (upgrade do pokoju) + wspólna pula z części wspólnej bibliotek
4. Nowy system wizualny w stylu Dustpile, zastosowany we WSZYSTKICH ekranach Tumolec
5. Przeniesienie Koła/Plinko/Rzutu monetą pod pływający przycisk boczny, działające w trybie solo (lokalnie) i co-op (Firestore, jak dziś)

Ręczne dodawanie gier po tytule i paczki gier **zostają bez zmian**, jako alternatywny sposób budowania puli obok importu Steam.

## 1. Przepływ ogólny

- Strona główna (`src/app/page.tsx`) zamienia się z formularza "Stwórz/Dołącz pokój" na ekran ustawień solo: link Steam + filtry backlogu + solo/multi + "Wczytaj bibliotekę".
- **Solo**: import + filtrowanie + swipe działają **wyłącznie lokalnie w przeglądarce** (React state, bez Firestore, bez tworzenia pokoju) — szybciej, zero zbędnych zapisów, zgodnie z zachowaniem Dustpile ("Twoje wybory zostają w przeglądarce").
- **"Co-op / Dodaj znajomego"** (dostępny na ekranie ustawień i w trakcie swipe'a): tworzy pokój (`createRoom` + `joinRoom`, bez zmian), wsadowo (`writeBatch`) dodaje aktualnie odfiltrowaną listę gier do puli pokoju, pokazuje **już istniejący** popup kod/link/QR z Fazy 5 (podpięcie w nowym miejscu, zero nowego kodu na sam popup).
- Znajomy dołącza istniejącym `joinRoom`, dostaje to samo pole Steam co ekran startowy solo — jeśli wypełni, jego lista appid trafia do jego dokumentu uczestnika.
- Gdy ≥2 uczestników ma podpięty Steam: opcja "Gry, które macie wspólnie" — część wspólna bibliotek, filtrowana do tagów co-op/multiplayer, wsadowo dodana do puli.
- **Silnik rund eliminacji (swipe, głosowanie, zwycięzca) nie zmienia się w ogóle** — cała nowa praca jest na poziomie "skąd biorą się gry w puli".

## 2. Import biblioteki Steam

Nowy endpoint server-side `src/app/api/steam/library/route.ts` (klucz `STEAM_API_KEY` z env, nigdy w kliencie):

1. Parsuje wejście (URL profilu / vanity name / steamid64) — reużyć istniejący parser z pola wyszukiwania jeśli jest wydzielony, inaczej wydzielić.
2. Jeśli nie steamid64: `ISteamUser/ResolveVanityURL` → steamid64.
3. `IPlayerService/GetOwnedGames&include_appinfo=1&include_played_free_games=1` → `{appid, name, playtime_forever, playtime_2weeks}[]`.
4. Profil prywatny: Steam zwraca pustą odpowiedź bez `game_count`, nie wyjątek — trzeba to jawnie rozpoznać i pokazać czytelny komunikat, nie cichą pustą pulę.

**Wydajność**: `GetOwnedGames` daje tylko appid+playtime, bez okładki/tagów. Dociąganie `appdetails` (już mamy, z cache `steam_cache`) dzieje się DOPIERO dla gier, które przejdą filtr backlogu (na surowych appid+playtime, za darmo, bez sieci) — i to leniwie, karta po karcie w miarę przybliżania się w talii, nie całą listę naraz. Przy bibliotece 500+ gier to jedyny realistyczny sposób, żeby import nie był bolesny.

## 3. Filtrowanie

**Backlog** (pojedynczy wybór, radio): czysta funkcja `filterByPlaytime(games, filter): SteamOwnedGame[]` w nowym `src/lib/steamLibrary.ts` + test Vitest, na `playtime_forever` (minuty), zero dodatkowych zapytań:
- `never`: `=== 0`
- `under2h`: `< 120`
- `under10h`: `< 600`
- `abandoned`: `120 ≤ x < 600`

**Solo/multiplayer**: zależy od kategorii Steam (`appdetails`), których świadomie nie ciągniemy dla całej listy naraz. Filtrowanie "w locie" podczas leniwego dociągania kart: biorę kolejnego kandydata po filtrze backlogu → dociągam `appdetails` (cache-first) → sprawdzam zgodność z solo/multi → jeśli nie pasuje, pomijam i biorę następnego, aż znajdę kartę do pokazania. Talia zawsze poprawnie odfiltrowana, zero nadmiarowych zapytań.

**UI**: nowy współdzielony komponent `ToggleChip`/`ToggleGrid` (siatka wzajemnie wykluczających się kafelków, podświetlone obramowanie na aktywnym) — jeden komponent, reużywany dla backlogu i solo/multi teraz, dla trybów/gatunków w kolejnych fazach.

## 4. Przepływ solo → co-op i wspólne biblioteki

- Upgrade do co-op: `createRoom` + `joinRoom` (bez zmian) + wsadowe dodanie aktualnej odfiltrowanej listy gier importu do `rooms/{code}/games` (`writeBatch`, realistyczne rozmiary po filtrach to dziesiątki gier).
- Nowe opcjonalne pole na dokumencie uczestnika: `rooms/{code}/participants/{id}.steamLibraryAppIds: number[]` — lista appid z importu tego uczestnika (po filtrze backlogu, przed filtrem solo/multi, żeby część wspólna mogła być liczona z pełniejszego zbioru).
- Nowa czysta funkcja `computeSharedLibrary(participants: {steamLibraryAppIds?: number[]}[]): number[]` w `src/lib/rooms.ts` + test — część wspólna zbiorów appid, liczona po stronie klienta (dane wszystkich uczestników już dostępne przez istniejącą subskrypcję).
- "Gry, które macie wspólnie" pojawia się w UI budowania puli, gdy ≥2 uczestników ma niepuste `steamLibraryAppIds`. Wynik filtrowany do tagów co-op/multiplayer (logika z sekcji 3), wsadowo dodany do puli.
- `firestore.rules`: walidacja nowego pola `steamLibraryAppIds` na zapisie uczestnika (lista liczb, limit rozmiaru analogiczny do `packages.gameIds`).

## 5. System wizualny

Tumolec ma już architekturę tokenów (`src/app/globals.css`, CSS custom properties + `@theme inline`), a większość komponentów używa klas semantycznych (`bg-card`, `border-border`, `bg-accent-brand`) — zmiana tokenów przełoży się automatycznie na większość ekranów.

- `--accent-brand`: fiolet → niebieski w stylu Dustpile (dokładny odcień dobrany na oko przy wdrożeniu, zgodnie z konwencją tego projektu).
- Nowy `--accent-glow`: box-shadow do podświetlanego obramowania zaznaczonych elementów — rozszerzenie istniejącego `--accent-brand-soft`.
- `.bg-app-gradient` (już istnieje): dodane delikatne, rozmyte plamy koloru w tle (ambient blobs jak u Dustpile), nowy wariant tej samej klasy.
- **Typografia zostaje bez zmian** — Space Grotesk (`--font-heading`) zamiast kopiowania gołego system-fontu Dustpile.
- Nowy komponent `ToggleChip`/`ToggleGrid` (sekcja 3) — jeden wzorzec kafelków-przełączników używany wszędzie.
- Przyciski akcji swipe'a: nowy wzorzec okrągłych, kolorowych przycisków (czerwony/zielony) zamiast obecnych — w Fazie A tylko pomiń/zagram funkcjonalnie, ale w nowym stylu, z miejscem na kolejne przyciski w późniejszych fazach.
- Efekt uboczny: pokój grupowy, Koło/Plinko/moneta, paczki dostają nowy wygląd przez sam update tokenów, bez osobnej przebudowy.

## 6. Mini-gry: przeniesienie pod przycisk boczny

- Koło/Plinko/Rzut monetą przestają być osobnymi zakładkami nawigacji pokoju — stają się dostępne przez mały pływający przycisk z boku ekranu (widoczny w solo i co-op), otwierający hub mini-gier.
- **Solo**: mini-gry działają lokalnie (React state, bez Firestore) — potrzebny nowy hook obok istniejącego pokojowego (np. `useLocalWheel`/`useLocalPlinko` analogiczne do `useRoomWheel` itp., jeśli taki wzorzec już istnieje — sprawdzić przy implementacji), prezentacyjne komponenty (`WheelCanvas`, `PlinkoBoard`, `FlipButton`) zostają bez zmian, bo są już czysto prezentacyjne.
- **Co-op**: bez zmian — dalej zsynchronizowane przez Firestore, jak dziś.

## Poza zakresem (YAGNI dla Fazy A — mapa drogowa)

- **Faza B**: chipsy gatunkowe z licznikami (tagi już mamy z `appdetails`), tryb "Moja lista życzeń" (nieoficjalny endpoint wishlist Steam, podobny w duchu do już używanych `storesearch`/`appdetails`), tryb "Rodzina/połączone biblioteki" jako trwała funkcja (nie tylko przez pokój co-op).
- **Faza C**: integracja HowLongToBeat (nieoficjalne API/scraper — HLTB nie ma oficjalnego API), panel recenzji, strony Statystyki/Osiągnięcia.
- **Faza D**: "Match co-op", "Sprytna kolejność", "Pomóż mi wybrać" — bardziej algorytmiczne tryby losowania/sugestii.
- **Tryb "Odkrywaj"** (nowości/nadchodzące z całego katalogu Steam, nie z biblioteki użytkownika) — wymaga innej infrastruktury (przeglądanie sklepu Steam po dacie premiery, nie per-appid), osobna decyzja co do fazy.
- **Kafelki wyboru motywu z kilkoma wariantami kolorystycznymi** — zgłoszone przez użytkownika jako "na później", nie część żadnej obecnej fazy. Do zaplanowania osobno, gdy przyjdzie kolej.

## Weryfikacja

- `npm run build` + `npx vitest run` po każdej grupie zadań (konwencja tego repo).
- Nowa logika czysta (`filterByPlaytime`, `computeSharedLibrary`) — testy Vitest kolokowane.
- Import biblioteki: ręczny test z prawdziwym publicznym profilem Steam (klucz API już w `.env.local`) — happy path + profil prywatny (komunikat błędu, nie cichy crash).
- Przepływ solo→co-op: ręczny test dwóch sesji przeglądarki (jak w Fazie 4/QR) — upgrade tworzy pokój, popup działa, drugi uczestnik dołącza i może podpiąć swój Steam, część wspólna liczy się poprawnie.
- Wizualnie: Playwright (jeśli dostępny) na kluczowych ekranach po zmianie tokenów — brak regresji kontrastu/czytelności na starych ekranach (pokój, Koło/Plinko/moneta).
