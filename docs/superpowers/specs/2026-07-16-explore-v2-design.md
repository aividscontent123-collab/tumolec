# Explore v2 — Design

## Kontekst

Zaraz po wdrożeniu [Explore → Polubione → Versus (rdzeń: biblioteki)](2026-07-15-explore-liked-versus-design.md) użytkownik przetestował na żywo i zgłosił 3 rzeczy. Ten dokument je rozstrzyga, po kolei, od najmniejszej do największej:

1. **Panel recenzji podczas swipe'a** — zgłoszony jako możliwa regresja. **Zbadane: NIE jest regresją**, zamknięte bez zmian w kodzie.
2. **Filtr gatunków** — przenosi się z ekranu startowego na ekran swipe, działa na żywo, w pokoju zsynchronizowany między graczami.
3. **Katalog Steam "Odkrywaj"** — trzecie źródło kandydatów do Explore (obok własnej i wspólnej biblioteki), prerekwizyt do (jeszcze niezaplanowanej) pełnej restrukturyzacji ekranu głównego z opcjonalnym profilem Steam.

Pełna restrukturyzacja ekranu głównego (profil całkowicie opcjonalny, "Eksploruj" jako pierwszy przycisk na stronie głównej niezależnie od źródła) **zostaje poza zakresem tego planu** — patrz "Poza zakresem" niżej.

## 1. Panel recenzji — zamknięte, bez zmian

`git log` na `GameDetailLayout.tsx` pokazuje, że akordeon mobilny (panel "Info" z recenzjami schowany za przyciskiem, domyślnie zwinięty) i sam panel recenzji (`ReleaseOrReviewsPanel`) powstały w commitach `93898f7` i `532e6be` — **oba wcześniejsze niż cała gałąź Explore/Polubione/Versus** (16 commitów `feat:`, wszystkie później w historii). Zachowanie jest identyczne na każdym ekranie swipe'a (stara pula, Explore, Versus, solo i pokój) — wszystkie renderują `GameDetailLayout` bez zmian.

Użytkownik zdecydował: zostawić jak jest (świadomy wybór layoutu — karta swipe zawsze widoczna, panele nie zasłaniają miejsca na telefonie).

## 2. Filtr gatunków na ekranie swipe

### Zachowanie

- Chipsy gatunku (`GENRE_OPTIONS`, dziś na `SoloSettingsScreen` i na ekranie "nie rozpoczęte" `RoomExploreScreen`) **znikają z ekranów startowych** i pojawiają się jako stały pasek nad `GameDetailLayout` na ekranie swipe (Explore, solo i pokój).
- Filtr multiplayer (solo/multi/wszystkie) **zostaje** na ekranie startowym, bez zmian — dotyczy tylko gatunku.
- Zmiana filtra **nie zdejmuje aktualnie pokazanej karty** — działa dopiero na kolejne karty pobierane przez `advance()`. Prostsze mentalnie, karta nie znika w trakcie decyzji.
- Domyślnie brak zaznaczonych gatunków = wszystkie (zgodne z dzisiejszym `matchesGenreFilter`, `selected.length === 0` → przepuszcza wszystko).

### UI — pasek pigułek (wzorem Dustpile, patrz referencja użytkownika)

Nowy komponent `GenreFilterBar` (`src/components/swipe/`) — pozioma, przewijana w bok lista pigułek ikona+etykieta, WIDOCZNA ZAWSZE (nie akordeon), umieszczona nad całym `GameDetailLayout` (nad Media/Kartą/Info, na desktopie i telefonie jednakowo). Reużywa logikę toggle z `MultiToggleChip` (multi-select), ale nowy wariant wizualny: małe zaokrąglone pigułki w jednym rzędzie zamiast siatki 2/3 kolumn.

Mapowanie gatunek → ikona (`lucide-react`, już zależność projektu) do ustalenia przy implementacji — 8 gatunków w `GENRE_OPTIONS`, każdy dostaje jedną pasującą ikonę (np. Akcja→miecze, RPG→różdżka, Sportowe→puchar). Czysto kosmetyczne, łatwe do podmiany później.

### Dane — solo

`SoloSwipeScreen` dostaje lokalny `useState<string[]>([])` na `genreFilter` zamiast przyjmować go jako niezmienny prop z `SoloHome`/`SoloSettingsScreen`. `SoloSettingsScreen` przestaje zbierać gatunki (usunięcie `MultiToggleChip` z tego ekranu), `SoloHome.handleLoadLibrary` traci parametr `genres`.

### Dane — pokój (sync między graczami)

`rooms/{roomCode}/session/state` już jest współdzielonym dokumentem z polami `coinflip`/`wheel`/`plinko`, `allow write: if true` **bez ograniczenia kluczy** — nowe pole `exploreGenreFilter: string[]` nie wymaga ŻADNEJ zmiany w `firestore.rules`. W `src/lib/rooms.ts`, wzorem `mergeWheel`/`subscribeToWheel`:

```ts
async function setExploreGenreFilter(roomCode: string, genres: string[]) {
  await setDoc(sessionStateRef(roomCode), { exploreGenreFilter: genres }, { merge: true });
}

function subscribeToExploreGenreFilter(roomCode: string, onChange: (genres: string[]) => void) {
  return onSnapshot(sessionStateRef(roomCode), (snap) => {
    onChange(snap.exists() ? ((snap.data().exploreGenreFilter as string[] | undefined) ?? []) : []);
  });
}
```

`RoomExploreScreen` subskrybuje na żywo (`onSnapshot`) i pisze przy każdej zmianie chipsa — każdy gracz widzi i może zmieniać filtr drugiego, zgodnie z zawsze-merge (nigdy nie nadpisuje `coinflip`/`wheel`/`plinko`).

## 3. Katalog Steam "Odkrywaj"

### Endpoint

Nowy `src/app/api/steam/discover/route.ts`, server-side proxy (jak `search`/`details`/`library`):

```
GET /api/steam/discover?genres=RPG,Akcja&start=0&excludeAppIds=730,440
```

Owija `https://store.steampowered.com/search/results/?tags=<id,id>&start=<n>&count=25&infinite=1` — **jedyny endpoint w projekcie zwracający HTML** (`results_html`) zamiast JSON. Parsowanie: wyciągnięcie `data-ds-appid` z każdego wyniku (regex albo `cheerio`, do rozstrzygnięcia empirycznie przy implementacji — regex bez nowej zależności jeśli kształt HTML wystarczająco stabilny, sprawdzone na żywo przed wyborem).

**Mapowanie gatunek → ID tagu Steam** — Steam nie publikuje oficjalnej listy. Do wyznaczenia przy implementacji: odpytać `/search/results/` dla kilku znanych gier danego gatunku, odczytać `data-ds-tagids`, potwierdzić wizualnie (nie ufać ID cytowanym w narzędziach community bez weryfikacji — już złapany jeden fałszywy trop dla RPG w poprzednim brainstormingu).

- **Sortowanie bez wybranego gatunku**: domyślne Steama, "Top Sellers" (najpopularniejsze) — nie najnowsze premiery.
- **Paginacja**: `start`/`count=25`, dociągane automatycznie w tle gdy w buforze zostanie kilka kart (ten sam duch co dzisiejszy leniwy fetch `appdetails` w `advance()`) — bez widocznego przycisku "Pokaż więcej".
- **Wykluczenie posiadanych gier**: tylko gdy bieżący uczestnik podał profil Steam, filtr po JEGO bibliotece (nie sumie graczy w pokoju) — endpoint nie musi znać stanu całego pokoju, prostsze.

### UI — trzecia opcja źródła (bez pełnej restrukturyzacji ekranu głównego)

- `SoloSettingsScreen`: przełącznik źródła "Biblioteka / Cały katalog" (`ToggleChip`, 2 opcje). Profil Steam **staje się opcjonalny TYLKO gdy wybrano "Cały katalog"** — reszta ekranu (backlog, multiplayer) bez zmian.
- `RoomExploreScreen`: analogiczny przełącznik źródła na ekranie "nie rozpoczęte", obok dzisiejszego "Wspólna biblioteka: N gier".
- To jest naturalny prekursor pełnej restrukturyzacji strony głównej (punkt 1 z oryginalnego feedbacku) — daje realnie testowalne "Odkrywaj" już teraz, zanim zajmiemy się tym, gdzie i jak wejście na stronę główną ma wyglądać.

## Poza zakresem (YAGNI / do zaplanowania osobno)

- **Pełna restrukturyzacja ekranu głównego** (profil całkowicie opcjonalny od pierwszego ekranu, "Eksploruj" jako pierwszy widoczny przycisk niezależnie od źródła) — świadomie odłożone do kolejnej sesji, po potwierdzeniu że Odkrywaj działa poprawnie w praktyce (mapowanie tagów, jakość wyników).
- Domyślnie rozwinięty (zamiast akordeonu) panel recenzji na telefonie — user zdecydował zostawić bez zmian.
- Ikona+etykieta dla filtrów "Darmowe"/"Bez wczesnego dostępu"/"Jest demo" jako osobne, nowe wymiary filtrowania — user potwierdził, że to była wyłącznie inspiracja wizualna dla chipsów gatunku, nie nowy zakres.
- Pamiętanie "pominiętych" kart w Explore między sesjami — nie zmienia się względem v1 (nadal świadomie pominięte, YAGNI).
- Liczniki na żywo przy chipsach gatunku dla bibliotek (ile gier pasuje) — jak w v1, wymagałby drogiego prefetchu całej biblioteki.

## Weryfikacja

- `npm run build` + `npx vitest run` po każdej grupie zadań (konwencja repo).
- `/api/steam/discover`: ręczny test z realnym zapytaniem, kilka gatunków — potwierdzenie wizualne (nie tylko brak błędu), że wyniki faktycznie pasują do wybranego gatunku, zanim ID tagów zostaną utrwalone w kodzie.
- Filtr gatunku na ekranie swipe: ręczny test solo (chipsy działają, kolejne karty zawężone, aktualna karta się nie zmienia) i pokój (dwie karty/przeglądarki, zmiana filtra przez jednego gracza widoczna u drugiego na żywo).
- Odkrywaj jako trzecie źródło: ręczny test bez profilu (katalog działa), z profilem (posiadane gry wykluczone), paginacja przy wyczerpaniu bufora bez widocznego zacinania.
