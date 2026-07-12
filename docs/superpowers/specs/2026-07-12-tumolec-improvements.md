# Tumolec — cztery usprawnienia (2026-07-12)

Cztery niezależne kawałki, każdy budowany i mergowany osobno, w osobnym worktree. Kontekst pełny: `work/active/Tumolec.md` w vaulcie Obsidian (`C:\Users\miros\Desktop\RUFLO`).

> **Uwaga o zakresie:** to druga runda na tym repo. Pierwsza („Faza 5" — QR, share, sesje eliminacji, paczki gier, Plinko) jest już zmergowana na `master` i działa. Te cztery usprawnienia budują na tym stanie.

Root cause każdego punktu został potwierdzony analizą kodu (file:line poniżej), nie zgadywaniem.

---

## 1. Bug: dołączenie przez QR z telefonu nie jest widoczne u właściciela na desktopie (branch `fix/firestore-longpolling`)

**Objaw (słowa użytkownika):** znajomy dołącza do pokoju przez QR z telefonu, właściciel jest już w lobby na desktopie — nie widzą się nawzajem.

**Co ZOSTAŁO wykluczone (żeby nie leczyć objawu w złym miejscu):**
- To NIE jest błąd logiki QR. Flow QR wywołuje dokładnie tę samą funkcję `joinRoom` co ręczne dołączenie (`RoomLobby.tsx:71-79`), brak osobnej/rozbieżnej ścieżki.
- To NIE jest stara/cache'owana subskrypcja. Lista uczestników to poprawny `onSnapshot` (`src/lib/rooms.ts`, `subscribeToParticipants`), nie jednorazowy `getDocs`.

**Root cause:** `src/lib/firebase.ts:18` inicjalizuje Firestore płaskim `getFirestore(app)` — bez `experimentalAutoDetectLongPolling`. Domyślny transport WebChannel (streaming) bywa buforowany/blokowany przez sieci desktopowe, proxy firmowe, VPN-y i ad-blockery: **pierwszy snapshot** dochodzi po fallbacku HTTP, ale **kolejne pushowane zdarzenia live już nie**. To dokładnie tłumaczy objaw — dane początkowe się ładują (lobby się pokazuje), ale późniejsze dołączenie znajomego nie dociera na desktop w czasie rzeczywistym. Objaw jest z natury przerywany i zależny od sieci desktopu, co pasuje do transportu, nie do logiki.

**Rozwiązanie (jednolinijkowa zmiana warstwy sieciowej):** zamienić `getFirestore(app)` na `initializeFirestore(app, { experimentalAutoDetectLongPolling: true })`. Flaga każe SDK samo wykryć, czy streaming działa, i przełączyć się na long-polling, gdy nie działa — bez utraty realtime, tylko innym transportem. Jest w pełni backward-compatible: gdy streaming działa, zachowanie się nie zmienia; gdy nie działa (dzisiejszy bug), naprawia live-update.

**Detal implementacyjny (nie „ślepy" one-liner):** `initializeFirestore` rzuca, jeśli zostanie wywołane dwa razy na tym samym `app` (np. przy HMR w devie, gdy moduł jest re-ewaluowany). Dlatego użyć bezpiecznego idiomu singletona spójnego z istniejącym guardem `getApps().length` w tym pliku: inicjalizuj przez `initializeFirestore` tylko gdy `app` jest świeżo tworzony, w przeciwnym razie `getFirestore(app)`. Dokładny kształt w planie.

**Weryfikacja (bug sieciowy — trudny do testu jednostkowego, więc protokół ręczny + argument bezpieczeństwa):**
- To NIE ma testu Vitest — nie ma tu czystej logiki, jest zmiana konfiguracji transportu.
- **Protokół before/after (wymagany, nie „zaufaj teorii"):** dwie realne sesje przeglądarki na jeden pokój (desktop + drugie okno/urządzenie). Jedno dołącza po utworzeniu pokoju przez drugie; potwierdzić, że lista uczestników aktualizuje się na obu bez odświeżania. Idealnie odtworzyć warunek blokujący streaming (np. rozszerzenie blokujące, restrykcyjna sieć) i potwierdzić, że po zmianie live-update dalej działa.
- **Potwierdzenie, że flaga jest aktywna:** w DevTools → Network filtrować po `firestore.googleapis.com` — po zmianie, gdy auto-detect wybierze long-polling, żądania idą jako powtarzane POST-y (`/channel` z `type=terminate`/kolejne long-polle) zamiast jednego wiszącego streamu. To potwierdza, że nowy transport jest w grze.
- **Argument backward-compat:** `experimentalAutoDetectLongPolling` nie wymusza long-pollingu — najpierw próbuje streamingu, przełącza się dopiero po wykryciu problemu. Środowiska, gdzie dziś działa, nie regresują.

**Brak zmian:** danych, `firestore.rules`, żadnego innego pliku poza `src/lib/firebase.ts`.

**Poza zakresem (YAGNI):**
- Migracja na modularną konfigurację cache/persistence (`persistentLocalCache` itd.) — nikt o to nie prosił, to osobny temat.
- Wymuszenie `experimentalForceLongPolling` (twarde long-polling zawsze) — gorsze niż auto-detect, degraduje sieci gdzie streaming działa.

---

## 2. Słaba jakość obrazka na karcie swipe (branch `feat/swipe-image-quality`)

**Objaw (słowa użytkownika):** obrazek gry na karcie swipe jest słabej jakości.

**Root cause:** `SwipeCard.tsx:66-74` renderuje `game.coverImageUrl` przez `<Image fill className="object-cover">` na wysokiej, portretowej karcie. `coverImageUrl` pochodzi z `rooms.ts:95` (`cache?.headerImageUrl`) ← `steam.ts:85` (`data.header_image`), czyli ze stałego steamowego `header.jpg` **460×215, poziomego**. Poziomy obrazek rozciągany i kadrowany do wypełnienia pionowej karty jest miękki/rozmyty — to nie kwestia kompresji, tylko złego assetu do tego kształtu.

**Rozwiązanie:** dla karty swipe użyć pionowego assetu Steam CDN per-appid: `https://cdn.akamai.steamstatic.com/steam/apps/{steamAppId}/library_600x900_2x.jpg` (1200×1800, natywnie pionowy — pasuje do kształtu karty bez rozciągania). URL jest w pełni deterministyczny z `steamAppId`, który `SwipeCard` już ma (`game.steamAppId`, używany w `SwipeCard.tsx:131`).

**Decyzja architekta (uzasadniona) — NIE ruszamy Firestore/schematu:** portretowy URL liczymy klient-side z `steamAppId` inline w `SwipeCard`. Alternatywa (dodać pole `portraitImageUrl` do `steam_cache`, dotykając `steam.ts`, typu `SteamCacheEntry` i allowlisty `hasOnly` w `firestore.rules`) jest bardziej inwazyjna bez realnej korzyści — URL jest czystą funkcją appid, nie ma czego cache'ować. Host `*.akamai.steamstatic.com` jest już w `next.config.ts` `remotePatterns` (`next.config.ts:13`), więc `cdn.akamai.steamstatic.com` przechodzi bez zmiany konfiguracji.

**Obsługa braku assetu (realne ryzyko — nie każdy appid ma library art):** gdy `library_600x900_2x.jpg` zwróci 404, `next/image` odpali `onError`. `SwipeCard` (komponent kliencki) trzyma źródło w stanie: startuje od portretu, na `onError` przełącza na dotychczasowy poziomy `game.coverImageUrl` (już przekazywany). Trzeci poziom — brak jakiegokolwiek obrazka — obsługuje istniejący placeholder (`SwipeCard.tsx:75-84`), bez zmian. Efekt: karta nigdy nie pokazuje zepsutego obrazka.

**Zakres ograniczony do karty swipe:** miniatury w `GamePoolList` (96×48, poziome — `GamePoolList.tsx:23-31`) zostają na `headerImageUrl` — dla małej poziomej miniatury header jest właściwy. Portret dotyczy tylko wysokiej karty swipe.

**Testy:** `slotProbabilities`-style — czysta funkcja `steamLibraryPortraitUrl(steamAppId): string` w nowym `src/lib/steamImages.ts`, z jednym asertem w `steamImages.test.ts`. Sama funkcja to jednolinijkowy template, ale błąd w formacie ścieżki CDN = każdy obrazek 404 = cała funkcja po cichu degraduje do fallbacku i „nic się nie zmienia". Ten jeden test blokuje regres formatu URL. Fallback na `onError` to logika UI (nie czysta) — bez testu jednostkowego, weryfikowana ręcznie/wizualnie.

**Brak zmian:** danych, `firestore.rules`, `next.config.ts`, `rooms.ts`, `types.ts`.

**Poza zakresem (YAGNI):**
- Pole `portraitImageUrl` w `steam_cache` (patrz decyzja wyżej).
- Prefetch/preload assetów portretowych.
- Zmiana obrazków w innych miejscach niż karta swipe (pula, historia — tam poziome miniatury są OK).

---

## 3. Paczki gier dostępne niezależnie od pokoju (branch `feat/global-packages-page`)

**Cel (słowa użytkownika):** paczki gier powinny być osiągalne niezależnie od jakiegokolwiek pokoju, „zawsze wiszące na stronie".

**Co JEST już zrobione (żeby nie budować od nowa):** model danych jest już globalny. `packages` to kolekcja **top-level** w Firestore (`rooms.ts` `createPackage`/`subscribeToPackages`, potwierdzone regułą top-level `match /packages/{packageId}` w `firestore.rules` z Fazy 5), nie scope'owana per pokój. To dokładnie to, czego użytkownik chce — **żadnej zmiany Firestore/reguł nie trzeba.**

**Faktyczna luka jest tylko w UI:** jedyne wejście do paczek to `PackageControls` renderowane wewnątrz `GamePoolScreen.tsx:45`, osiągalne wyłącznie przez `/room/[code]/pool` — czyli pokój musi już istnieć. Użytkownik chce widzieć paczki bez wchodzenia do pokoju.

**Rozwiązanie:** nowa strona top-level `src/app/packages/page.tsx`, osiągalna z ekranu głównego (`src/app/page.tsx`), niezależna od pokoju. Listuje wszystkie globalne paczki (nazwa, liczba gier, data) korzystając z istniejącego, już-nieza­scope'owanego `subscribeToPackages`. Link do niej dodany na stronie głównej (obok formularza stwórz/dołącz).

**Decyzja architekta (uzasadniona) — strona globalna jest READ-ONLY (przeglądarka paczek):**
- **Tworzenie paczki** wymaga aktywnej puli pokoju (zapisuje bieżące gry pod nazwą) — z natury dzieje się w pokoju. Zostaje w `PackageControls` na ekranie puli, bez zmian.
- **Wczytanie paczki do puli** wymaga docelowego pokoju, w którym jesteś uczestnikiem. Też zostaje w `PackageControls`, bez zmian.
- Strona globalna nie ma pokoju w kontekście, więc nie może ani zapisywać (brak puli), ani wczytywać (brak celu) — pełni rolę „zawsze dostępnej listy": widzisz, co macie zapisane. To realizuje intencję („zawsze wiszące na stronie") bez dublowania flow, który ma sens tylko w pokoju.
- Lista pokazuje nazwę + liczbę gier + datę z pól, które `GamePackage` już ma (`{ id, name, gameCount, gameIds }`). Dzięki temu **nie trzeba dotykać `rooms.ts`** — zero nowych funkcji danych, zero nakładania się z Feature 2.

**Brak zmian:** danych, `firestore.rules`. Istniejący flow tworzenia/wczytywania paczek w pokoju działa jak dziś — to zmiana **addytywna**, nie zastępcza.

**Poza zakresem (YAGNI):**
- Rozwijanie paczki do miniatur/tytułów pojedynczych gier na stronie globalnej — wymagałoby nowej funkcji odczytu `steam_cache` po `gameIds` w `rooms.ts` (kolizja z Feature 2, dodatkowe I/O). v1: nazwa + liczba wystarczą. Dodać, gdy ktoś poprosi.
- Usuwanie paczek ze strony globalnej — reguły to `allow delete: if false` (paczki niezmienne w v1). Wymagałoby zmiany reguł; świadomie odłożone.
- Wczytywanie paczki do pokoju ze strony globalnej (potrzebny picker pokoju + członkostwo) — scope creep, flow wczytywania zostaje w pokoju.

---

## 4. Ekrany mini-gier jako główny fokus wizualny (branch `feat/minigame-screen-redesign`)

**Cel (słowa użytkownika):** ekrany mini-gier (Koło, Rzut monetą, Plinko) mają być głównym fokusem wizualnym — dużo większy wizual gry, dużo większe kontrolki wyboru.

**Stan potwierdzony jako nieproporcjonalny:**
- `WheelCanvas` ma na sztywno `SIZE = 280` px (`WheelCanvas.tsx:7-8`) — nie skaluje się do viewportu.
- `PlinkoBoard` ma na sztywno `WIDTH = 320`, `PEG_GAP = 34` (`PlinkoBoard.tsx:10-11`) — canvas Matter.js o stałej rozdzielczości, nie skaluje się.
- Wiersze wyboru Koła: `px-4 py-2 text-sm` z małym `✕` (`WheelControls.tsx:39-53`).
- Wiersze ustawienia Plinko: `px-4 py-2 text-sm` z małymi ikonami `↑`/`↓` (`PlinkoSetup.tsx:36-62`).
- `CoinFlip3D` dostaje już `flex-1` (najwięcej miejsca, `CoinflipScreen.tsx:31-32`) — dziś najlepszy z trójki; reszta powinna dorównać.

**WAŻNE ograniczenie, które zmienia sugestię użytkownika (flag dla team-lead):** użytkownik zaproponował wiersze „jak sidebar z miniaturką, jak zakładka". Ale **wpisy Koła to wolny tekst** (`addWheelEntry`, dowolny string z inputa — `WheelControls.tsx:9-15`, `WheelCanvas` renderuje `entries: string[]`), **nie gry** — nie mają skojarzonego obrazka, więc miniatura jest fizycznie niemożliwa dla Koła. Miniatury mają sens **tylko dla Plinko**, którego wpisy to gry z puli (`PoolGame` z `coverImageUrl`, `PlinkoSetup.tsx:17`). Analogicznie do Rzutu monetą (binarne orzeł/reszka, brak wpisów) — nie wciskamy wzorca miniatury tam, gdzie nie pasuje.

**Wzorzec do adaptacji (już w repo, sprawdzony):** najbliższy „wiersz + miniatura" to `GamePoolList.tsx:19-53` (miniatura `next/image` 96×48 + tytuł + prawe małe przyciski akcji). Powiększyć TEN wzorzec dla wierszy Plinko, zamiast wymyślać nowy komponent sidebara od zera (którego w apce nie ma — brak `layout.tsx` dla pokoju, nawigacja to pionowy stos pigułek w lobby).

**Zakres:**
- **(a) Responsywny wizual gry:**
  - `WheelCanvas`: usunąć sztywne `SIZE`; SVG skaluje się przez `viewBox` (współrzędne wewnętrzne 0..280 zostają, viewBox mapuje je na kontener), owinięty w kwadratowy kontener `max-width: min(88vw, ~380px)`. Matematyka (`polarToCartesian`, `wedgePath`) bez zmian — działa w przestrzeni viewBox.
  - `PlinkoBoard`: powiększyć/dopasować do dostępnej szerokości viewportu. Ponytail: przestrzeń współrzędnych fizyki może zostać stała (320) z CSS-owym skalowaniem canvasa do `max-width: 100%` — dla animacji gry drobne skalowanie rastra jest akceptowalne; dokładny przelicznik pikseli tylko jeśli rozmycie przeszkadza przy weryfikacji.
- **(b) Powiększone wiersze wyboru:**
  - **Plinko:** wiersze ustawienia przerobione na powiększony wzorzec `GamePoolList` — miniatura gry + tytuł + etykieta szansy + większe przyciski `↑`/`↓`.
  - **Koło:** wiersze wpisów powiększone (większy `text`, większe pola, większy przycisk usuwania) — **bez miniatury** (wpisy to wolny tekst).
- **(c) Powiększone przyciski akcji na 3 ekranach:** „Losuj" (`WheelControls.tsx:57-65`), „Zrzuć" (`PlinkoSetup.tsx:64-72`), przycisk Rzutu (`FlipButton`). Coinflip nie ma wpisów — pas dotyczy tylko rozmiaru przycisku flip.

**Bez rozszerzania na niezwiązane ekrany:** wiersze paczek/puli poza zakresem tej grupy (żeby nie mieszać z Feature 3 i nie robić scope creepu). Zmiana dotyczy wyłącznie trzech ekranów mini-gier i ich komponentów.

**Brak zmian:** danych, `firestore.rules`. To zmiana czysto prezentacyjna.

**Testy:** zmiana jest wizualna/layoutowa — brak nowej czystej logiki, więc brak nowego testu Vitest. (`slotProbabilities` z Fazy 5 zostaje i dalej przechodzi.) Weryfikacja wizualna: build + ręczny/Playwright przegląd trzech ekranów na wąskim viewporcie.

**Poza zakresem (YAGNI):**
- Miniatury dla wpisów Koła (niemożliwe — wolny tekst).
- Wzorzec miniatury dla Rzutu monetą (binarny, brak wpisów).
- Fixed-step `Engine.update` dla Plinko (już oznaczone jako `ponytail:` upgrade path w `PlinkoBoard.tsx:6-9` — autorytatywny `winnerSlot` i tak chroni wybór gry).
- Wspólny komponent sidebara/nawigacji (apka go nie ma; adaptujemy istniejący wzorzec wiersza).

---

## Podsumowanie zależności między funkcjami

**Zero nakładających się plików między czterema branchami** — każdy dotyka rozłącznego zbioru:

| Feature | Branch | Pliki |
|---------|--------|-------|
| 1 | `fix/firestore-longpolling` | `src/lib/firebase.ts` |
| 2 | `feat/swipe-image-quality` | `src/components/swipe/SwipeCard.tsx`, `src/lib/steamImages.ts` (+test) |
| 3 | `feat/global-packages-page` | `src/app/packages/page.tsx` (nowy), `src/app/page.tsx` |
| 4 | `feat/minigame-screen-redesign` | `WheelCanvas.tsx`, `WheelControls.tsx`, `PlinkoBoard.tsx`, `PlinkoSetup.tsx`, `WheelScreen.tsx`, `PlinkoScreen.tsx`, `CoinflipScreen.tsx`, `FlipButton.tsx` |

Wszystkie cztery są w pełni równoległe (osobne worktree), bez zależności logicznej ani konfliktów przy merge. Kolejność mergowania dowolna. **Żaden z czterech nie dotyka `firestore.rules` ani `src/lib/rooms.ts`** — w odróżnieniu od Fazy 5 nie ma tu nawet mechanicznych kolizji do rozwiązania.
