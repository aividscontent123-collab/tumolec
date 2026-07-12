# Tumolec — pięć drobnych funkcji (2026-07-12)

Pięć niezależnych kawałków, każdy budowany i mergowany osobno. Kontekst pełny: `work/active/Tumolec.md` w vaulcie Obsidian (`C:\Users\miros\Desktop\RUFLO`).

## 1. QR kod pokoju

**Cel:** ułatwić dołączenie do pokoju telefon-do-telefonu (np. przy kanapie), bez przepisywania linku.

**Rozwiązanie:** nowa, mała zależność `qrcode` (generacja SVG/canvas czysto po stronie klienta, brak backendu, $0 kosztu). W `RoomLobby.tsx`, obok istniejącego sposobu udostępniania linku, dodany kod QR kodujący `https://tumolec.vercel.app/room/{code}`.

**Brak zmian:** danych, `firestore.rules`.

## 2. Natywny share

**Cel:** jeden przycisk zamiast kopiowania linku ręcznie.

**Rozwiązanie:** `navigator.share({ title, url })` (Web Share API, natywna funkcja przeglądarki, zero zależności). Fallback do obecnego zachowania (kopiuj do schowka) gdy `navigator.share` niedostępne (typowo desktop).

**Brak zmian:** danych, `firestore.rules`.

## 3. Naprawa sesji rund eliminacji + rozszerzona historia

**Problem znaleziony podczas projektowania (nie zgłoszony wcześniej, nigdy nieujawniony w praktyce):** `eliminationRounds` w `rooms/{code}` używają płaskich ID (`round-1`, `round-2`, ...) bez rozróżnienia której "sesji" (rozgrywki) należą. `SwipeScreen` zawsze zaczyna sprawdzanie od `round-1` przy nowym mouncie. Druga rozgrywka w tym samym pokoju (po tym jak pierwsza gra została już wybrana i oznaczona jako "played") odczytałaby stary, zakończony dokument `round-1` z poprzedniej sesji i pokazałaby ponownie starego zwycięzcę zamiast zacząć nową rundę eliminacji.

**Naprawa:** dodanie pola `sessionId: string` do dokumentu rundy (`RoundDoc`).
- Gdy `SwipeScreen` bootstrapuje pierwszą rundę świeżej sekwencji (nie ma aktywnej rundy w statusie `"voting"`), generuje nowy `sessionId` (losowy string, np. `crypto.randomUUID()` lub odpowiednik dostępny w przeglądarce) i zapisuje go w `startRound`.
- Gdy `resolveRound` w `SwipeScreen` woła `startRound` dla kolejnej rundy tej samej sekwencji (`round N+1` po nierozstrzygniętej rundzie N), przekazuje ten sam `sessionId` co runda N (dziedziczenie, nie losowanie od nowa).
- Wyścig wielu klientów przy tworzeniu PIERWSZEJ rundy sekwencji jest nieszkodliwy (tak jak dziś): różni klienci mogą wylosować różny `sessionId` przy jednoczesnym starcie, ale tylko jeden zapis ostatecznie wygrywa w Firestore (ten sam wzorzec co istniejący `getRound`→`startRound` bootstrap) — całość pozostaje spójna, bo wszyscy czytają to samo, ostatecznie zapisane `sessionId`.

**Rozszerzona historia (`/room/[code]/history`):** dla każdej rozegranej gry (status `"played"`), znajdź rundy o tym samym `sessionId` co ostatnia (finałowa) runda tej sekwencji — finałowa runda to ta, gdzie `survivors.length === 1` i `survivors[0] === steamAppId` tej gry. Wyświetl przebieg: numer rundy, ile gier wchodziło, które przetrwały. Dopisanie do istniejącego widoku historii (lista rozegranych gier), rozwijane per gra, nie osobny ekran.

**Zmiany w `firestore.rules`:** `eliminationRounds` create/update — dodać `sessionId` do dozwolonych pól (`hasOnly`), z walidacją `is string`.

**Testy:** `lib/elimination.ts`/nowa funkcja grupująca rundy po `sessionId` — czysta logika, testowana Vitest (wzorzec istniejących testów).

## 4. Paczki gier (nowa funkcja)

**Cel:** nie trzeba za każdym razem ręcznie dodawać tych samych gier — zapisana wcześniej lista gier ("paczka") może zostać dodana do dowolnego pokoju jednym kliknięciem.

**Zakres (potwierdzony z użytkownikiem):**
- Paczki tworzone przez użytkowników (nie kuratorowane przez twórcę apki) — zapis obecnej aktywnej puli pokoju pod nazwą.
- Widoczność: **globalna, wspólna lista** paczek (bez logowania/scopowania — spójne z resztą apki, jedna ekipa znajomych).
- Paczka **niezmienna po zapisaniu** (v1) — zmiana zawartości = zapis nowej paczki pod inną nazwą. Edycja istniejącej paczki świadomie odłożona (YAGNI), nikt o to nie prosił.

**Model danych — nowa kolekcja top-level:**
```
packages/{packageId}
  name: string
  createdAt: timestamp
  gameIds: number[]   // referencje do steam_cache/{steamAppId}, ten sam wzorzec co rooms/{code}/games
```

**UI, na `/room/[code]/pool`:**
- Przycisk **"Zapisz jako paczkę"** — dialog z nazwą, zapisuje `gameIds` = aktualne `status: "active"` gry z puli tego pokoju.
- Przycisk **"Dodaj z paczki"** — lista zapisanych paczek (nazwa, liczba gier), wybór dodaje wszystkie jej gry do puli **bieżącego** pokoju jako `status: "active"`, **pomijając gry już obecne w puli** (identyfikacja po `steamAppId`, żeby nie nadpisać istniejącego stanu `played`/`removed` z powrotem na `active`).
- Dodawane gry muszą mieć wpis w `steam_cache` — jeśli paczka zawiera `steamAppId` bez cache (nie powinno się zdarzyć, bo paczka powstaje z już-dodanych gier), pominąć z cichym logiem, nie wywalać całej operacji.

**Zmiany w `firestore.rules`:** nowa kolekcja `packages/{packageId}`:
```
match /packages/{packageId} {
  allow read: if true;
  allow create: if request.resource.data.keys().hasOnly(['name', 'createdAt', 'gameIds'])
    && request.resource.data.name is string && request.resource.data.name.size() <= 60
    && request.resource.data.gameIds is list;
  allow update, delete: if false;
}
```

**Testy:** funkcja "które gry z paczki są nowe względem obecnej puli" (czysta logika, filter po steamAppId) — Vitest.

## 5. Plinko — nowa mini-gra wyboru gry (alternatywa dla swipe)

**Cel:** dosłowna gra Plinko — kulka spada przez planszę kołków i ląduje w slocie; gra przypisana do zwycięskiego slotu zostaje wybrana do grania. Osobny byt jak `coinflip`/`wheel` (nowa zakładka `/room/[code]/plinko`), alternatywa dla eliminacji przez swipe.

**Potwierdzone z użytkownikiem:**
- **Prawdziwa symulacja fizyki** (nie ustalony-z-góry-wynik-plus-animacja jak w coinflip/wheel) — silnik `Matter.js` (2D, darmowy, MIT).
- **Naturalna fizyka Plinko** — środkowe sloty mają wyższą szansę niż brzegowe (tak jak w prawdziwej grze), to nie błąd.
- **Jasna matryca przypisania** — ekran ustawienia przed zrzutem, gdzie uczestnicy przypisują aktywne gry z puli do konkretnych slotów, z widoczną etykietą przybliżonej szansy każdego slotu.

**Model szans slotów (matematyka, nie zgadywanie):** dla N aktywnych gier plansza ma **N-1 rzędów kołków** (klasyczny układ Plinko: N slotów u dołu = N-1 rzędów +1). Przy założeniu ~50/50 odbicia w lewo/prawo na każdym rzędzie, szansa wylądowania w slocie k (indeksowane od 0) to rozkład dwumianowy: `C(N-1, k) / 2^(N-1)`. Czysta funkcja (np. `lib/plinko.ts: slotProbabilities(n: number): number[]`), testowana Vitest — używana WYŁĄCZNIE do wyświetlenia etykiet szansy na ekranie ustawienia (np. "Duża szansa" w środku, "Mała szansa" na brzegach), nie do samego losowania wyniku (o tym decyduje realna symulacja fizyki).

**Ekran ustawienia (ta sama zakładka, przed zrzutem):**
- Lista aktywnych gier z puli (min. 2, ten sam warunek co swipe/koło fortuny).
- Reorderowalna (drag albo przyciski góra/dół, wzorzec z `WheelControls.tsx`) — kolejność na liście = przypisanie do slotów planszy, środek listy = środkowe sloty.
- Etykieta przybliżonej szansy przy każdej pozycji, policzona z `slotProbabilities(n)`.

**Zrzut kulki:**
- Plansza kołków wygenerowana proceduralnie dla N-1 rzędów, dopasowana do liczby slotów.
- Silnik `Matter.js` symuluje realny spadek kulki z odbiciami od kołków, renderowany na `<canvas>`.
- Przycisk "Zrzuć" (analogicznie do "Losuj" w kole fortuny) dostępny dla któregokolwiek uczestnika.

**Synchronizacja między uczestnikami (ten sam wzorzec co `triggerWheelSpin`/`triggerCoinflip` w `lib/rooms.ts`):**
- Klient klikający "Zrzuć" generuje parametry startowe (np. początkowa pozycja X kulki, ewentualny seed) i publikuje je do `rooms/{code}/session/state` (pole `plinko`, ten sam dokument co `coinflip`/`wheel`, zawsze `{ merge: true }` na własnym polu — nigdy nie nadpisuje sąsiednich pól).
- Wszyscy klienci subskrybujący ten dokument uruchamiają lokalnie identyczną symulację Matter.js (ten sam silnik, ten sam fixed timestep, te same parametry startowe) — powinny dać identyczny wynik.
- **Zabezpieczenie na rozjazd wizualny:** klient, który wyzwolił zrzut, po zakończeniu SWOJEJ symulacji publikuje też ostateczny wynik (indeks zwycięskiego slotu) do tego samego dokumentu. To pole jest **autorytatywne** dla tego, która gra zostaje oznaczona jako wybrana (`setGameStatus(..., "played")`) — nawet jeśli czyjaś lokalna animacja fizyki minimalnie się różni (inna klatka/timing), wynik gry (którą grę gramy) zawsze pochodzi z opublikowanej wartości, nie z lokalnej symulacji każdego klienta z osobna.

**Zmiany w `firestore.rules`:** `session/state` już ma `allow write: if true` (niski risk, grupa 2-4 znajomych, ten sam dokument co coinflip/wheel) — pole `plinko` nie wymaga nowej reguły.

**Nowa zależność:** `matter-js` (+ `@types/matter-js`), $0 kosztu, MIT license.

**Testy:** `slotProbabilities()` — Vitest, kilka przypadków (n=2, n=3, n=5, suma prawdopodobieństw = 1, symetria rozkładu).

## Poza zakresem (świadomie, YAGNI)

- Edycja istniejącej paczki po zapisaniu.
- Usuwanie paczek.
- Scopowanie paczek per pokój/grupa (globalna lista wystarcza dla jednej ekipy znajomych).
- Ręczny wybór podzbioru gier do zapisu jako paczka (v1 zapisuje całą aktywną pulę).
- Plinko: równe szanse dla każdego slotu (świadomie odrzucone — naturalna fizyka Plinko jest zamierzona).
- Plinko: zapisywanie/odtwarzanie wcześniejszych zrzutów w historii (na razie tylko wynik = która gra wygrała, jak przy swipe).
