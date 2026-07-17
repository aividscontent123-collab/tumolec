# Restrukturyzacja strony głównej (solo) — Design

## Kontekst

Punkt 1 z [Explore v2 — feedback do zaplanowania](../../../work/active/Explore%20v2%20—%20feedback%20do%20zaplanowania.md) (poza zakresem specu i planu z 2026-07-16, który zbudował punkty 2 i 3): dzisiejsza strona główna solo (`SoloSettingsScreen`) wymusza jedną decyzję ("Twoja biblioteka" / "Cały katalog Steam" przez `ToggleChip`) ZANIM pokaże się pojedynczy przycisk startowy ("Wczytaj bibliotekę" / "Przeglądaj katalog", etykieta zależna od wybranego źródła). Użytkownik chce, żeby "Eksploruj" było dostępne **od razu, jednym kliknięciem**, bez wcześniejszej decyzji o źródle.

Dotyczy WYŁĄCZNIE strony głównej solo (`/`). Ekran startowy pokoju (`RoomExploreScreen`) zostaje bez zmian — inny kontekst (trzeba już być w pokoju), mniej dotkliwe tarcie, świadomie poza zakresem tej rundy.

## Zakres

Wyłącznie `src/components/solo/SoloSettingsScreen.tsx`. **Zero zmian w `SoloHome.tsx`** — `handleLoadLibrary(source, profile, backlog, multiplayer)` już przyjmuje `source` jako jawny parametr (nie czyta go ze stanu toggle'a), więc dwa oddzielne przyciski wywołujące tę samą funkcję z inną wartością `source` działają bez żadnej zmiany kontraktu. To czysto prezentacyjna restrukturyzacja jednego pliku.

## Nowy układ ekranu

1. Nagłówek "Tumolec" — bez zmian.
2. Podtytuł — zmieniony z dzisiejszego ("Przeglądaj gry kurzące się w twojej bibliotece...", specyficzny dla biblioteki) na neutralny względem źródła, np. "Wybierz jak chcesz przeglądać gry — z własnej biblioteki albo z całego katalogu Steam."
3. **Dwa równorzędne, duże przyciski obok siebie** (`grid grid-cols-2 gap-3`, wzorem istniejących dwukolumnowych układów w tym pliku):
   - **"Eksploruj katalog"** — zawsze aktywny. `onClick={() => onLoadLibrary("catalog", profile.trim(), backlog, multiplayer)}`.
   - **"Eksploruj bibliotekę"** — `disabled={loading || !profile.trim()}`. `onClick={() => onLoadLibrary("library", profile.trim(), backlog, multiplayer)}`.
   - Styl: jeden wariant wizualny współdzielony (nie ma już rozróżnienia "główny"/"drugorzędny" przycisk — oba są główne), `bg-accent-brand` dla obu, wyłączony stan przez istniejące `disabled:opacity-50`.
4. **Sekcja "Dostosuj"** — zawsze widoczna pod przyciskami (bez zwijania):
   - Pole "Twój profil Steam" — bez zmian wizualnych, ale etykieta traci dzisiejsze `{source === "catalog" && "(opcjonalnie)"}` (nie ma już `source`, profil jest po prostu zawsze opcjonalny — wymagany tylko do odblokowania przycisku biblioteki, co widać po jego stanie `disabled`).
   - Filtr "Które gry pokazywać?" (backlog) — widoczny **tylko gdy `profile.trim() !== ""`** (zastępuje dzisiejszy warunek `source === "library"` — bez profilu backlog i tak nic nie filtruje, więc pokazywanie go wcześniej byłoby mylące).
   - Filtr "Jak chcesz grać?" (multiplayer) — zawsze widoczny, bez zmian (dotyczy obu źródeł).
5. Reszta strony (link "Zapisane paczki gier", "Stwórz pokój dla znajomych", "Mam kod pokoju od znajomego") — bez zmian.

## Usunięte

- `SOURCE_OPTIONS` i stan `source` (`useState<"library" | "catalog">`) — nie potrzebne, każdy przycisk jawnie przekazuje swoje źródło.
- Warunkowa etykieta przycisku (`loading ? "Wczytuję…" : source === "catalog" ? ... : ...`) — zastąpiona dwoma stałymi etykietami przycisków, z osobnym stanem `loading` na oba (jeden `loading` z `SoloHome` blokuje oba przyciski jednocześnie, tak jak dziś blokuje jeden — `SoloHome.handleLoadLibrary` i tak obsługuje tylko jedno żądanie naraz).

## Poza zakresem

- Ekran startowy pokoju (`RoomExploreScreen`) — świadomie niezmieniany, inna decyzja produktowa do rozważenia osobno kiedyś.
- Jakakolwiek zmiana w `SoloHome.tsx`, `SoloSwipeScreen.tsx`, `/api/steam/discover`, czy logice paginacji katalogu — wszystko to już zbudowane i działające (2026-07-16), niedotknięte tym specem.
- Zwijana/rozwijana sekcja "Dostosuj" — świadomie odrzucone na rzecz zawsze-widocznej wersji (mniej stanu, mniej kodu).

## Weryfikacja

- `npm run build` (repo convention).
- Ręczny test w przeglądarce (Playwright): (1) wejście na `/` pokazuje od razu dwa aktywne/nieaktywne-odpowiednio przyciski bez wcześniejszego wyboru źródła; (2) "Eksploruj katalog" klikalny bez profilu, prowadzi do Explore katalogu; (3) "Eksploruj bibliotekę" wyłączony bez profilu, aktywuje się po wpisaniu profilu i faktycznie ładuje bibliotekę; (4) filtr backlogu pojawia się dopiero po wpisaniu profilu; (5) reszta strony (paczki, tworzenie/dołączanie do pokoju) działa bez zmian.
