# Versus — minigra rozstrzygająca remis finałowej dwójki (moneta/koło)

Data: 2026-07-18

## Kontekst

Faza D roadmapy Tumolec (`work/active/Tumolec.md`) wymieniała "inteligentne tryby losowania" jako jeden blok. Po doprecyzowaniu z użytkownikiem okazało się, że pierwszy konkretny kawałek to coś węższego i innego niż algorytmiczna optymalizacja: **opcjonalny, ręcznie wyzwalany przycisk**, który grupa może kliknąć, gdy utknęła na finałowej dwójce gier w `EliminationRound` (silnik współdzielony przez zakładki Swipe i Versus) i nie może/nie chce dalej głosować. Nie jest to automatyczne wykrywanie remisu w `resolveRound` — istniejąca cicha ścieżka `breakTieDeterministically` (środek drabinki, remisy >2 gier) zostaje bez zmian.

Kluczowe ustalenie z brainstormingu: w przeciwieństwie do reszty minigier w apce (moneta, koło fortuny, Plinko — gdzie każdy gracz sam wyzwala akcję bez pytania reszty), ta decyzja **kończy całą sesję wyboru gry**, więc wymaga **jednomyślnej zgody wszystkich uczestników pokoju** zanim jakikolwiek klient będzie mógł wybrać metodę (moneta/koło) i wylosować.

## Zakres

- Dotyczy wyłącznie **rundy finałowej** — `round.poolAtStart.length === 2` (i analogicznie `pool.length === 2` w solo). Remisy w środku drabinki (np. 4 gry o 2 miejsca) nadal rozstrzyga cicho `breakTieDeterministically`, bez zmian.
- Działa identycznie w obu trybach opartych o `EliminationRound` — zakładka Swipe (pula ręczna) i Versus (polubione) — bo obie to cienkie wrappery nad tym samym silnikiem (`src/components/room/EliminationRound.tsx`).
- Osobna ścieżka dla solo (`src/lib/useLocalVersus.ts`) — bez Firestore, bez etapu zgód (1 uczestnik = zgoda trywialna).

## Model danych (pokój)

Rozszerzenie `RoundDoc` (`src/lib/rooms.ts`) o nowe pole na dokumencie `rooms/{roomCode}/eliminationRounds/{roundId}`:

```ts
export type TieBreakState = {
  agreedParticipantIds: string[];   // kto kliknął "zgadzam się losować" (toggle)
  method: "coin" | "wheel" | null;  // ustawiane dopiero gdy agreedParticipantIds pokrywa WSZYSTKICH participants
  result: number | null;            // zwycięski steamAppId, losowany OD RAZU przy wyborze metody (jak triggerCoinflip/triggerWheelSpin — wynik znany zanim animacja się skończy)
  spinning: boolean;
  triggeredAt: Timestamp | null;
} | null;
```

`tieBreak` nie istnieje na dokumencie dopóki ktoś nie kliknie "zgadzam się" pierwszy raz — `updateDoc` z zapisem po zagnieżdżonej ścieżce (`"tieBreak.agreedParticipantIds"`, `arrayUnion`) tworzy strukturę automatycznie, bez potrzeby inicjalizacji w `startRound`.

Brak osobnego pola na "kandydatów" — to zawsze `round.poolAtStart` (dokładnie 2 appidy), już dostępne.

## Nowe funkcje w `rooms.ts`

- `toggleTieBreakAgreement(roomCode, roundId, participantId)` — `arrayUnion`/`arrayRemove` na `tieBreak.agreedParticipantIds` w zależności od obecnego stanu (czysty toggle, bez dodatkowej logiki).
- `triggerRoundTieBreak(roomCode, roundId, method: "coin" | "wheel", candidates: [number, number])` — losuje zwycięzcę (`pickTieBreakWinner`, patrz niżej) i zapisuje `{ method, result, spinning: true, triggeredAt: serverTimestamp() }` na `tieBreak`. Bez guarda przeciw podwójnemu triggerowi — spójne z `triggerWheelSpin`/`triggerCoinflip`, które też nie mają takiej ochrony (nadpisanie przez drugiego klikającego jest nieszkodliwe, taki sam poziom tolerancji na łagodny wyścig jak reszta apki).
- Zakończenie: UI woła istniejący `finishRound(roomCode, roundId, [result])` po zakończeniu animacji — dokładnie ta sama ścieżka co normalne zakończenie rundy głosowaniem, więc `WinnerScreen` pojawia się bez żadnych zmian w `RoundVoting`.

## Nowa czysta funkcja w `elimination.ts`

```ts
export function pickTieBreakWinner(candidates: [number, number]): number {
  return candidates[Math.floor(Math.random() * 2)];
}
```

Jedyna logika warta testu jednostkowego w tej funkcji — reszta to Firestore/UI, zweryfikowane ręcznie (Playwright), zgodnie z konwencją projektu dla minigier (Coinflip/Wheel/Plinko też nie mają testów jednostkowych UI).

## Komponenty UI

### `components/room/RoomTieBreaker.tsx` (pokój)

Renderowany wewnątrz `RoundVoting` (`EliminationRound.tsx`) obok `SwipeActionButtons`, warunek: `round.poolAtStart.length === 2 && round.status === "voting"`.

Stany renderowania (na podstawie `round.tieBreak` + `participants`):
1. **Brak zgody wszystkich** (`agreedParticipantIds` nie pokrywa wszystkich `participants`): baner `"🎲 X/N zgodziło się losować"` + przycisk toggle "Zgadzam się losować" / "Wycofaj zgodę" (zależnie czy `participantId` własny jest już na liście). Próg liczony jako `participants.every(p => agreedParticipantIds.includes(p.participantId))` — jeśli ktoś kto się zgodził później wyjdzie z pokoju, przestaje się liczyć do progu (lista `participants` jest zawsze aktualna przez `subscribeToParticipants`), więc nie blokuje reszty osieroconą zgodą.
2. **Zgoda wszystkich, `method === null`**: baner zamienia się w wybór `"Moneta" | "Koło"` — klik któregokolwiek gracza wywołuje `triggerRoundTieBreak`.
3. **`method !== null`**: animacja. Dla `"coin"` → `CoinFlip3D` z nowymi propsami `headsLabel`/`tailsLabel` = tytuły `gameByAppId.get(poolAtStart[0])`/`[1]` (mapowanie `result === poolAtStart[0] ? "heads" : "tails"` do istniejącego kształtu `CoinflipState`). Dla `"wheel"` → `WheelCanvas` z `entries = [tytuł gry A, tytuł gry B]`, `winner = tytuł zwycięskiej gry`, `extraTurns` liczone **lokalnie u każdego klienta** (nie synchronizowane — nie wpływa na to, na którym segmencie koło się zatrzyma, tylko na liczbę pełnych obrotów, czysto kosmetyczne, więc nie wymaga zapisu do Firestore). Po zakończeniu animacji (`onAnimationComplete`/analogiczny callback do `onSpinAnimationComplete`) wywołuje `finishRound(roomCode, roundId, [result])`, idempotentnie (dowolny klient może to zrobić, jak dziś przy normalnym zakończeniu rundy).

### `components/room/SoloTieBreaker.tsx` (solo)

Prostszy — brak etapu zgód (1 uczestnik = zgoda trywialna). Przycisk "🎲 Nie możecie się zdecydować?" widoczny gdy `pool.length === 2` w `useLocalVersus`, klik od razu pokazuje wybór "Moneta"/"Koło". Nowy stan w `useLocalVersus.ts`:

```ts
const [tieBreak, setTieBreak] = useState<{ method: "coin" | "wheel"; result: number } | null>(null);
function startTieBreak(method: "coin" | "wheel") {
  if (pool.length !== 2) return;
  setTieBreak({ method, result: pickTieBreakWinner([pool[0], pool[1]]) });
}
```

Po animacji: `setWinner(tieBreak.result)` (ta sama ścieżka co normalny finał `resolveRound` → `status: "winner"`).

### Zmiana w `CoinFlip3D.tsx`

Dodanie opcjonalnych propsów `headsLabel?: string` / `tailsLabel?: string` (domyślnie `"Orzeł"`/`"Reszka"`) — zero wpływu na istniejącą samodzielną zakładkę Coinflip, która ich nie przekazuje.

`WheelCanvas.tsx` — bez zmian, już przyjmuje dowolne `entries: string[]`.

## Świadomie poza zakresem

- Remisy w środku drabinki (>2 gry, więcej niż 1 wolne miejsce) — zostaje `breakTieDeterministically`, niezmienione. To osobny, mniej dotkliwy dług techniczny (już opisany komentarzem TODO w `elimination.ts`), nieobjęty tym specem.
- Anulowanie/reset w trakcie animacji (np. gracz zamyka kartę w trakcie spinu) — brak dedykowanego watchdoga jak w Plinko (`resetStuckPlinkoDrop`). Jeśli w praktyce okaże się problemem, prosty follow-up analogiczny do Plinko.
- Synchronizacja `extraTurns` koła między klientami — celowo lokalna, nie globalna (patrz wyżej, brak wpływu na wynik).
- Zmiana zdania po osiągnięciu zgody wszystkich, ale przed wyborem metody — możliwa (toggle działa też w tym stanie, wystarczy że ktoś się wycofa i banner wraca do stanu 1).

## Testy

- `pickTieBreakWinner`: test jednostkowy sprawdzający, że wynik dla obu argumentów zawsze należy do `candidates` (zamockowany `Math.random` dla obu gałęzi 0/1).
- Reszta (toggle zgód, trigger, UI, Firestore) — weryfikacja ręczna przez Playwright na dev-serwerze (pokój z 2+ symulowanymi uczestnikami + solo), zgodnie z konwencją projektu dla przepływów minigier/Firestore.

## Related

- `work/active/Tumolec.md` — roadmapa, Faza D
- `src/lib/elimination.ts` — `resolveRound`/`breakTieDeterministically`, komentarz TODO o remisach
- `docs/superpowers/specs/2026-07-15-explore-liked-versus-design.md` — spec wprowadzający `EliminationRound`/Versus
