# Tumolec — Faza C, kawałek 2: Strony Statystyki

## Kontekst

Faza C ("panele szczegółów gry w stylu Dustpile") jest niemal domknięta — panel recenzji Steam (2026-07-15/16) i badge HowLongToBeat (2026-07-18) już wdrożone. Ten spec pokrywa ostatni niezrobiony kawałek: strony statystyk (bez odznak/osiągnięć — to świadomie osobny, przyszły kawałek, jeśli w ogóle powstanie).

Zakres: statystyki dla **obu** trybów (solo i pokój), jako **osobny** nowy ekran "Statystyki" (nie sekcja w istniejącej Historii).

## Problem: solo nie ma trwałej historii Versus

Tryb pokoju ma pełną historię w Firestore (`eliminationRounds`, `games` ze statusem `played`). Tryb solo (`useLocalVersus`) trzyma wynik Versus wyłącznie w pamięci komponentu React — znika po odświeżeniu strony. Jedyna trwała rzecz w solo dziś to lista polubionych (`lib/localLiked.ts`).

**Decyzja**: dodać nowy localStorage log wygranych Versus w solo, analogiczny do `localLiked.ts`.

## Definicja "zagrane/wygrane"

W pokoju oznaczenie gry jako `status: "played"` (używane przez istniejący ekran Historia) to **osobna, ręczna akcja** w puli gier (`setGameStatus`) — nie dzieje się automatycznie po wygraniu Versus (potwierdzone w kodzie: `finishRound`/`VersusScreen`/`WinnerScreen` nigdy nie wywołują `setGameStatus`).

**Decyzja**: Statystyki liczą **ukończone sesje Versus** (runda ze `status: "finished"` i dokładnie 1 ocalałym), niezależnie od tego, czy ktoś później ręcznie oznaczył grę jako "zagraną" w puli. To odpowiada na pytanie "ile razy wybieraliśmy grę przez Versus" — reroll ("Przelosuj") liczy się jako kolejna, osobna sesja.

## Zmiany w modelu danych

### Pokój (Firestore)

`finishRound(roomCode, roundId, survivors)` w `src/lib/rooms.ts` dopisuje pole `finishedAt: serverTimestamp()` przy każdym zamknięciu rundy (nie tylko finałowej — upraszcza kod, a tylko finałowa runda z 1 ocalałym jest brana pod uwagę przy liczeniu statystyk).

`firestore.rules`, reguła `eliminationRounds` `allow update`: dopisać `'finishedAt'` do `hasOnly([...])` oraz walidację `request.resource.data.get('finishedAt', null) == null || request.resource.data.finishedAt is timestamp`.

**Deploy `firestore.rules` wymaga wyraźnej zgody użytkownika przed `firebase deploy --only firestore:rules`, oraz weryfikacji na żywo przez Playwright** — sama kompilacja reguł bez błędu nie wystarcza jako dowód poprawności (już dwukrotnie w tym projekcie brakujące pole w regułach nie zostało złapane inaczej niż żywym testem: HLTB 2026-07-18, tie-breaker 2026-07-18).

Brak backfillu dla rund zakończonych przed tą zmianą — liczą się do sum/gatunków/godzin HLTB, ale są pomijane w statystyce "aktywność w czasie" (brak `finishedAt`).

### Solo (localStorage)

Nowy moduł `src/lib/localVersusHistory.ts`, wzorem `localLiked.ts`:

```ts
const KEY = "tumolec:solo:versusHistory";

export type VersusWin = { steamAppId: number; wonAt: number };

export function addVersusWin(current: VersusWin[], steamAppId: number): VersusWin[] {
  return [...current, { steamAppId, wonAt: Date.now() }];
}

export function getLocalVersusHistory(): VersusWin[] { /* localStorage.getItem, try/catch -> [] */ }
export function saveLocalVersusHistory(entries: VersusWin[]): void { /* localStorage.setItem */ }
```

`LocalVersusScreen.tsx` (lub gdziekolwiek `useLocalVersus` jest skonsumowany) dopisuje wpis jednorazowo, gdy `winner` przechodzi z `null` na wartość (efekt strzeżony refem/warunkiem, żeby nie dublować przy re-renderze).

## Moduł obliczeniowy `src/lib/stats.ts`

Czysta funkcja, bez zależności od Firestore/DOM (wzorem `elimination.ts`/`history.ts`) — testowalna niezależnie.

**Wejście**:
- `wins: { steamAppId: number; wonAt: number | null }[]` — pokój: `RoundDoc[]` przefiltrowane do `status === "finished" && survivors?.length === 1`, zmapowane na `{ steamAppId: survivors[0], wonAt: finishedAt ?? null }`; solo: bezpośrednio z `getLocalVersusHistory()`.
- `cacheByAppId: Record<number, SteamCacheEntry | undefined>` — pojedyncze `getDoc(doc(db, "steam_cache", String(appId)))` per unikalny appid z `wins` + `liked` (wzorem `computeSharedLibrary`), złożone w mapę.
- `likedAppIds: number[]` — pokój: subcollection `liked`; solo: `getLocalLiked()`.

**Wyjście — typ `Stats`**:

```ts
export type Stats = {
  totalWins: number;
  topGames: { steamAppId: number; wins: number }[];   // top 5, malejąco
  topGenres: { tag: string; count: number }[];          // z tagów (wins ∪ liked, dedup po appid)
  totalHltbHours: number;                               // suma HLTB Main Story, dedup po unikalnym appid z wins
  activity: {
    last7days: number;
    last30days: number;
    mostActiveWeekday: string | null;                   // "poniedziałek".."niedziela", null gdy brak danych z wonAt
  };
};

export function computeStats(
  wins: { steamAppId: number; wonAt: number | null }[],
  cacheByAppId: Record<number, SteamCacheEntry | undefined>,
  likedAppIds: number[],
): Stats
```

Reguły obliczeń:
- `totalWins` = `wins.length`.
- `topGames`: grupowanie `wins` po `steamAppId`, licznik wystąpień, sort malejąco po liczbie, remis rozstrzygany po `steamAppId` (deterministycznie, wzorem `buildHistory`), top 5.
- `topGenres`: zbiór unikalnych appid z `wins.map(w => w.steamAppId)` ∪ `likedAppIds`, dla każdego doczytane `tags` z `cacheByAppId`, zliczone wystąpienia tagów, sort malejąco.
- `totalHltbHours`: unikalne appid z `wins` (Set), suma `cacheByAppId[id]?.hltbMainStory ?? 0`.
- `activity`: filtr `wins` do tych z `wonAt !== null`; `last7days`/`last30days` = liczba wygranych w oknie `Date.now() - wonAt <= N*24h`; `mostActiveWeekday` = dzień tygodnia (`toLocaleDateString("pl-PL", {weekday: "long"})`) z najwięcej wystąpień, `null` gdy zbiór pusty.

### Testy: `src/lib/stats.test.ts`

Vitest, wzorem `elimination.test.ts`: pusty input (wszystko zero/null), ranking gatunków z remisami, top gier z remisem po appid, sumowanie HLTB z dedupem tej samej gry wygranej 2×, klasyfikacja aktywności (w oknie/poza oknem 7/30 dni), pominięcie wpisów z `wonAt: null` w `activity` przy jednoczesnym uwzględnieniu ich w `totalWins`/`topGames`/`topGenres`/`totalHltbHours`.

## UI

### Pokój: `src/components/room/StatsScreen.tsx` na `/room/[code]/stats`

Subskrybuje `subscribeToEliminationRounds` (już istnieje) + jednorazowy odczyt `liked` subcollection + `steam_cache` per appid. Link "Statystyki" w lobby, obok istniejącego linku "Historia".

### Solo: `src/components/solo/SoloStatsScreen.tsx`

Czyta `getLocalVersusHistory()` + `getLocalLiked()` + `steam_cache` per appid. Link w menu solo, obok "Polubione".

### Layout (wspólny dla obu wariantów)

Cztery sekcje pionowo:
1. Liczba wygranych Versus + top gry (nazwa + liczba wygranych, z okładką jak w Historii).
2. Ulubione gatunki — lista rankingowa (tag + liczba wystąpień).
3. Suma godzin HLTB ("Łącznie zagracie ok. Xh, jeśli dokończycie wszystko").
4. Aktywność — tekst: "X gier w ostatnim tygodniu, Y w ostatnim miesiącu, najbardziej aktywny dzień: {dzień}". Bez wykresu/biblioteki wizualizacji.

Stan pusty (`totalWins === 0`): "Jeszcze nie rozegraliście żadnego Versus 🎮", wzorem pustego stanu `HistoryScreen`.

## Poza zakresem

- Osiągnięcia/odznaki (odrębny, przyszły kawałek).
- Agregacja statystyk między wieloma pokojami — zawsze per jeden pokój / jeden profil solo.
- Wykresy/biblioteki wizualizacji.
- Backfill `finishedAt` dla rund sprzed tej zmiany.
