/** Warstwa dostępu do Firestore dla pokoi/uczestników/puli gier. Czysto
 * mechaniczne CRUD + subskrypcje -- logika eliminacji rundowej żyje osobno
 * w lib/elimination.ts (czysta funkcja, testowalna bez Firestore). Model
 * danych: work/active/Tumolec.md w vaulcie Obsidian. */

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { SwipeGame } from "@/lib/types";
import { toSwipeGame } from "@/lib/steam";
import { pickTieBreakWinner, type SwipeDirection } from "@/lib/elimination";

// Bez znaków mylonych przy czytaniu na głos / przepisywaniu z ekranu (0/O, 1/I/L).
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

function randomRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export async function createRoom(name: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomRoomCode();
    const ref = doc(db, "rooms", code);
    if ((await getDoc(ref)).exists()) continue; // kolizja, praktycznie niemożliwa, ale sprawdzamy
    await setDoc(ref, { name, createdAt: serverTimestamp(), activeFeature: "swipe" });
    return code;
  }
  throw new Error("Nie udało się wylosować wolnego kodu pokoju, spróbuj ponownie.");
}

export async function roomExists(roomCode: string): Promise<boolean> {
  return (await getDoc(doc(db, "rooms", roomCode))).exists();
}

export function subscribeToRoom(
  roomCode: string,
  onChange: (data: { name: string; activeFeature: string } | null) => void,
) {
  return onSnapshot(doc(db, "rooms", roomCode), (snap) => {
    onChange(snap.exists() ? (snap.data() as { name: string; activeFeature: string }) : null);
  });
}

export type Participant = { participantId: string; nickname: string; steamLibraryAppIds?: number[] };

export async function joinRoom(
  roomCode: string,
  participantId: string,
  nickname: string,
  steamLibraryAppIds?: number[],
) {
  await setDoc(doc(db, "rooms", roomCode, "participants", participantId), {
    nickname,
    joinedAt: serverTimestamp(),
    ...(steamLibraryAppIds ? { steamLibraryAppIds } : {}),
  });
}

export function subscribeToParticipants(roomCode: string, onChange: (p: Participant[]) => void) {
  return onSnapshot(collection(db, "rooms", roomCode, "participants"), (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data() as { nickname: string; steamLibraryAppIds?: number[] };
        return { participantId: d.id, nickname: data.nickname, steamLibraryAppIds: data.steamLibraryAppIds };
      }),
    );
  });
}

export type PoolGame = SwipeGame & {
  status: "active" | "played" | "removed";
  addedBy: string;
  playedAt: number | null;
};

function toPoolGame(gameDoc: QueryDocumentSnapshot<DocumentData>, cache: DocumentData | undefined): PoolGame {
  const g = gameDoc.data();
  return {
    ...toSwipeGame(g.steamAppId, cache),
    addedBy: g.addedBy,
    status: g.status,
    playedAt: g.playedAt?.toMillis?.() ?? null,
  };
}

/** Dodaje grę do puli pokoju. Zakłada, że steam_cache/{steamAppId} już istnieje
 * (wywołaj /api/steam/details przy wyborze podpowiedzi, zanim to zawołasz). */
export async function addGameToPool(roomCode: string, steamAppId: number, addedBy: string) {
  await setDoc(doc(db, "rooms", roomCode, "games", String(steamAppId)), {
    steamAppId,
    addedBy,
    status: "active",
    addedAt: serverTimestamp(),
  });
}

export async function setGameStatus(roomCode: string, steamAppId: number, status: "played" | "removed") {
  await updateDoc(doc(db, "rooms", roomCode, "games", String(steamAppId)), {
    status,
    playedAt: status === "played" ? serverTimestamp() : null,
  });
}

/** Subskrybuje pulę gier pokoju połączoną z ich metadanymi z globalnego cache.
 * Uproszczenie Fazy 1: pojedyncze `getDoc` na cache per gra przy każdej zmianie
 * listy zamiast osobnej subskrypcji per dokument -- cache rzadko się zmienia
 * (odświeżany raz na 30 dni), więc nie potrzebuje własnego realtime listenera. */
export function subscribeToGamePool(roomCode: string, onChange: (games: PoolGame[]) => void) {
  return onSnapshot(collection(db, "rooms", roomCode, "games"), async (snap) => {
    const games = await Promise.all(
      snap.docs.map(async (gameDoc) => {
        const cacheSnap = await getDoc(doc(db, "steam_cache", String(gameDoc.data().steamAppId)));
        return toPoolGame(gameDoc, cacheSnap.exists() ? cacheSnap.data() : undefined);
      }),
    );
    onChange(games);
  });
}

// ── Rundy eliminacji ──────────────────────────────────────────────────────

export async function startRound(
  roomCode: string,
  sessionId: string,
  roundNumber: number,
  poolAtStart: number[],
): Promise<string> {
  const roundId = `${sessionId}-round-${roundNumber}`;
  await setDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId), {
    sessionId,
    roundNumber,
    poolAtStart,
    status: "voting",
  });
  return roundId;
}

export async function castSwipe(
  roomCode: string,
  roundId: string,
  participantId: string,
  steamAppId: number,
  direction: SwipeDirection,
) {
  const swipeId = `${participantId}_${steamAppId}`;
  await setDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId, "swipes", swipeId), {
    participantId,
    steamAppId,
    direction,
  });
}

export function subscribeToRoundSwipes(
  roomCode: string,
  roundId: string,
  onChange: (swipes: { participantId: string; steamAppId: number; direction: SwipeDirection }[]) => void,
) {
  return onSnapshot(collection(db, "rooms", roomCode, "eliminationRounds", roundId, "swipes"), (snap) => {
    onChange(
      snap.docs.map(
        (d) => d.data() as { participantId: string; steamAppId: number; direction: SwipeDirection },
      ),
    );
  });
}

/** Stan ręcznie wyzwalanej minigry rozstrzygającej finałową dwójkę (moneta/koło).
 * Żyje na dokumencie rundy (`eliminationRounds/{roundId}`), nie na `session/state`
 * jak coinflip/wheel/plinko -- bo dotyczy KONKRETNEJ rundy, nie całego pokoju.
 * `agreedParticipantIds` musi pokrywać WSZYSTKICH `participants`, zanim `method`
 * może zostać ustawiony (patrz RoomTieBreaker) -- w przeciwieństwie do reszty
 * minigier w apce, ta decyzja kończy całą sesję wyboru gry. */
export type TieBreakState = {
  agreedParticipantIds: string[];
  method: "coin" | "wheel" | null;
  resultAppId: number | null;
  spinning: boolean;
  triggeredAt: Timestamp | null;
};

export type RoundDoc = {
  roundNumber: number;
  poolAtStart: number[];
  status: "voting" | "finished";
  survivors: number[] | null;
  sessionId: string;
  tieBreak?: TieBreakState;
};

export async function getRound(roomCode: string, roundId: string): Promise<RoundDoc | null> {
  const snap = await getDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId));
  return snap.exists() ? (snap.data() as RoundDoc) : null;
}

/** Znajduje trwającą sekwencję eliminacji, żeby świeży mount/nowy klient
 * dołączył do niej zamiast startować równoległą. Determinizm przy wyścigu:
 * gdy dwóch klientów wystartowało równolegle różne sesje, wszyscy zbiegają
 * się do tej o najmniejszym sessionId (reszta zostaje osierocona, nieszkodliwa). */
export async function getActiveRound(
  roomCode: string,
): Promise<{ sessionId: string; roundNumber: number } | null> {
  const q = query(
    collection(db, "rooms", roomCode, "eliminationRounds"),
    where("status", "==", "voting"),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const rounds = snap.docs.map((d) => d.data() as RoundDoc);
  rounds.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  return { sessionId: rounds[0].sessionId, roundNumber: rounds[0].roundNumber };
}

// ── Tie-break finałowej dwójki (moneta/koło) ────────────────────────────────
// Pole `tieBreak` na dokumencie KONKRETNEJ rundy -- zawsze `setDoc({ tieBreak: {...} }, { merge: true })`,
// nigdy zapis całego dokumentu rundy, żeby nie nadpisać `poolAtStart`/`status`/`survivors`.

async function mergeTieBreak(roomCode: string, roundId: string, tieBreak: Record<string, unknown>) {
  await setDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId), { tieBreak }, { merge: true });
}

/** Toggle zgody jednego uczestnika na rozstrzygnięcie losowe. Próg "wszyscy się
 * zgodzili" liczony po stronie UI (RoomTieBreaker) względem aktualnej listy
 * `participants` -- ta funkcja tylko zapisuje/usuwa jeden wpis. */
export async function toggleTieBreakAgreement(
  roomCode: string,
  roundId: string,
  participantId: string,
  agreed: boolean,
) {
  await mergeTieBreak(roomCode, roundId, {
    agreedParticipantIds: agreed ? arrayUnion(participantId) : arrayRemove(participantId),
  });
}

/** Wywoływane dopiero gdy WSZYSCY uczestnicy się zgodzili (sprawdzane przez UI) --
 * losuje zwycięzcę OD RAZU (jak triggerCoinflip/triggerWheelSpin), animacja
 * dogania wynik. Bez guarda przeciw podwójnemu triggerowi -- nieszkodliwe przy
 * wyścigu dwóch klientów, tak samo tolerowane jak w triggerWheelSpin. */
export async function triggerRoundTieBreak(
  roomCode: string,
  roundId: string,
  method: "coin" | "wheel",
  candidates: [number, number],
) {
  const resultAppId = pickTieBreakWinner(candidates);
  await mergeTieBreak(roomCode, roundId, {
    method,
    resultAppId,
    spinning: true,
    triggeredAt: serverTimestamp(),
  });
}

/** Wszystkie rundy pokoju (do rozbudowanej historii). */
export function subscribeToEliminationRounds(
  roomCode: string,
  onChange: (rounds: RoundDoc[]) => void,
) {
  return onSnapshot(collection(db, "rooms", roomCode, "eliminationRounds"), (snap) => {
    onChange(snap.docs.map((d) => d.data() as RoundDoc));
  });
}

export function subscribeToRound(
  roomCode: string,
  roundId: string,
  onChange: (round: RoundDoc | null) => void,
) {
  return onSnapshot(doc(db, "rooms", roomCode, "eliminationRounds", roundId), (snap) => {
    onChange(snap.exists() ? (snap.data() as RoundDoc) : null);
  });
}

/** Zamyka rundę z policzonym wynikiem. Wywoływane przez KTÓRYKOLWIEK klient,
 * który zauważy że wszyscy skończyli głosować -- bezpieczne przy wyścigu,
 * bo `survivors` to czysta funkcja tych samych danych (resolveRound), więc
 * każdy klient policzy identyczny wynik niezależnie od tego kto zapisze pierwszy. */
export async function finishRound(roomCode: string, roundId: string, survivors: number[]) {
  await updateDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId), {
    status: "finished",
    survivors,
  });
}

/** Sygnał "przelosuj" dla WSZYSTKICH uczestników pokoju -- na TYM SAMYM
 * `session/state` co reszta sygnałów mini-gier, zawsze `{ merge: true }`.
 * Nie tworzy nowej rundy samo z siebie -- każdy klient (w tym ten klikający)
 * subskrybuje to pole w EliminationRound.tsx i reaguje resetując swój lokalny
 * stan `session` do null, co ponownie uruchamia ISTNIEJĄCY mechanizm
 * bootstrapu nowej sesji (ten sam co przy pierwszym wejściu w Versus) oraz
 * ISTNIEJĄCY mechanizm zbiegania do wspólnego sessionId przy wyścigu wielu
 * klientów startujących rundę 1 równolegle -- zero nowej logiki eliminacji,
 * tylko ponowne odpalenie już przetestowanych ścieżek. */
export type RerollSignal = { triggeredAt: Timestamp };

export async function triggerReroll(roomCode: string) {
  await setDoc(
    doc(db, "rooms", roomCode, "session", "state"),
    { reroll: { triggeredAt: serverTimestamp() } },
    { merge: true },
  );
}

export function subscribeToRerollSignal(roomCode: string, onChange: (signal: RerollSignal | null) => void) {
  return onSnapshot(doc(db, "rooms", roomCode, "session", "state"), (snap) => {
    onChange(snap.exists() ? ((snap.data().reroll as RerollSignal | undefined) ?? null) : null);
  });
}

// ── Rzut monetą ───────────────────────────────────────────────────────────
// `rooms/{roomCode}/session/state` to WSPÓLNY dokument z zakładką koła fortuny
// (pole `wheel`, inny agent). Piszemy wyłącznie przez `{ merge: true }` na
// samym polu `coinflip`, żeby nigdy nie nadpisać `wheel` przy scaleniu.

/** Strukturalny podzbiór Firestore Timestamp -- pozwala trybowi solo (bez
 * Firestore) budować kompatybilny obiekt `{ toMillis: () => Date.now() }`
 * zamiast prawdziwego serverTimestamp(). */
export type TimestampLike = { toMillis(): number };

export type CoinflipState = {
  result: "heads" | "tails" | null;
  spinning: boolean;
  triggeredAt: TimestampLike | null;
};

/** Losuje wynik po stronie klienta i publikuje go od razu -- wszyscy
 * uczestnicy widzą ten sam `result` przez realtime subskrypcję i odgrywają
 * lokalnie tę samą animację niemal jednocześnie (patrz CoinFlip3D). */
export async function triggerCoinflip(roomCode: string): Promise<"heads" | "tails"> {
  const result: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
  await setDoc(
    doc(db, "rooms", roomCode, "session", "state"),
    { coinflip: { spinning: true, result, triggeredAt: serverTimestamp() } },
    { merge: true },
  );
  return result;
}

export function subscribeToCoinflip(roomCode: string, onChange: (coinflip: CoinflipState | null) => void) {
  return onSnapshot(doc(db, "rooms", roomCode, "session", "state"), (snap) => {
    onChange(snap.exists() ? ((snap.data().coinflip as CoinflipState | undefined) ?? null) : null);
  });
}

// ── Koło fortuny ──────────────────────────────────────────────────────────
// Wszystko pod `rooms/{roomCode}/session/state`, pole `wheel` -- ten sam
// dokument ma też pole `coinflip` (rzut monetą, inny agent). Zawsze `setDoc`
// z `{ merge: true }` i zagnieżdżonym obiektem `{ wheel: {...} }`, NIGDY
// `setDoc` całego dokumentu -- merge scala tylko podane pola (nawet
// zagnieżdżone), więc `coinflip` nigdy nie zostanie nadpisany.

export type WheelState = {
  entries: string[];
  spinning: boolean;
  winner: string | null;
  extraTurns: number | null;
};

function wheelStateRef(roomCode: string) {
  return doc(db, "rooms", roomCode, "session", "state");
}

async function mergeWheel(roomCode: string, wheel: Record<string, unknown>) {
  await setDoc(wheelStateRef(roomCode), { wheel }, { merge: true });
}

export async function addWheelEntry(roomCode: string, entry: string) {
  await mergeWheel(roomCode, { entries: arrayUnion(entry) });
}

export async function removeWheelEntry(roomCode: string, entry: string) {
  await mergeWheel(roomCode, { entries: arrayRemove(entry) });
}

/** Losuje zwycięzcę spośród aktualnych `entries` po stronie klienta, który
 * kliknął "Losuj", i zapisuje wynik + liczbę pełnych obrotów -- reszta
 * klientów odtwarza identyczną animację licząc kąt z tych samych danych
 * (zob. WheelCanvas), więc koło kręci się tak samo u wszystkich. */
export async function triggerWheelSpin(roomCode: string) {
  const snap = await getDoc(wheelStateRef(roomCode));
  const entries: string[] = (snap.exists() && (snap.data().wheel as WheelState | undefined)?.entries) || [];
  if (entries.length === 0) return;

  const winner = entries[Math.floor(Math.random() * entries.length)];
  const extraTurns = 4 + Math.floor(Math.random() * 3); // 4-6 pełnych obrotów, tylko dla ładniejszej animacji
  await mergeWheel(roomCode, { winner, extraTurns, spinning: true, triggeredAt: serverTimestamp() });
}

/** Wywoływane przez WheelCanvas po zakończeniu lokalnej animacji obrotu --
 * może to zrobić kilku klientów naraz, nieszkodliwe (ten sam zapis `false`). */
export async function finishWheelSpin(roomCode: string) {
  await mergeWheel(roomCode, { spinning: false });
}

export function subscribeToWheel(roomCode: string, onChange: (wheel: WheelState | null) => void) {
  return onSnapshot(wheelStateRef(roomCode), (snap) => {
    onChange(snap.exists() ? ((snap.data().wheel as WheelState | undefined) ?? null) : null);
  });
}

// ── Filtr gatunków Explore (pokój) ──────────────────────────────────────
// TEN SAM dokument `rooms/{roomCode}/session/state` co coinflip/wheel/plinko
// -- `setDoc(..., { merge: true })` na samym polu `exploreGenreFilter`, żeby
// nigdy nie nadpisać pozostałych pól. Każdy gracz widzi i może zmieniać
// filtr drugiego (allow write: if true na tym dokumencie, niski risk).

export async function setExploreGenreFilter(roomCode: string, genres: string[]) {
  await setDoc(doc(db, "rooms", roomCode, "session", "state"), { exploreGenreFilter: genres }, { merge: true });
}

export function subscribeToExploreGenreFilter(roomCode: string, onChange: (genres: string[]) => void) {
  return onSnapshot(doc(db, "rooms", roomCode, "session", "state"), (snap) => {
    onChange(snap.exists() ? ((snap.data().exploreGenreFilter as string[] | undefined) ?? []) : []);
  });
}

// ── Powiadomienie o starcie Versus ──────────────────────────────────────
// TEN SAM dokument `rooms/{roomCode}/session/state` co coinflip/wheel/plinko/
// exploreGenreFilter -- `setDoc(..., { merge: true })` na samym polu
// `versusStart`, nigdy nadpisanie całego dokumentu. Nieblokujące: kliknięcie
// "Rozpocznij Versus" i tak od razu przenosi klikającego, to pole tylko
// informuje resztę uczestników przez realtime listener.

export type VersusStartSignal = { triggeredBy: string; triggeredAt: Timestamp };

export async function signalVersusStart(roomCode: string, triggeredBy: string) {
  await setDoc(
    doc(db, "rooms", roomCode, "session", "state"),
    { versusStart: { triggeredBy, triggeredAt: serverTimestamp() } },
    { merge: true },
  );
}

export function subscribeToVersusStart(
  roomCode: string,
  onChange: (signal: VersusStartSignal | null) => void,
) {
  return onSnapshot(doc(db, "rooms", roomCode, "session", "state"), (snap) => {
    onChange(snap.exists() ? ((snap.data().versusStart as VersusStartSignal | undefined) ?? null) : null);
  });
}

// ── Paczki gier ───────────────────────────────────────────────────────────
// Globalna, wspólna kolekcja top-level `packages/{packageId}` (bez scope'owania
// per pokój -- jedna ekipa znajomych). Niezmienne po zapisaniu (v1): brak update/delete.

export type GamePackage = { id: string; name: string; gameCount: number; gameIds: number[] };

export async function createPackage(name: string, gameIds: number[]): Promise<void> {
  await addDoc(collection(db, "packages"), { name, gameIds, createdAt: serverTimestamp() });
}

export function subscribeToPackages(onChange: (packages: GamePackage[]) => void) {
  return onSnapshot(collection(db, "packages"), (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data() as { name: string; gameIds: number[] };
        return { id: d.id, name: data.name, gameCount: data.gameIds.length, gameIds: data.gameIds };
      }),
    );
  });
}

/** Dodaje wskazane gry do puli pokoju jako 'active'. Każda gra musi mieć wpis
 * w steam_cache (paczka powstaje z już-dodanych gier, więc powinien istnieć) --
 * brak cache pomijamy z cichym logiem zamiast wywalać całą operację. */
export async function addGamesToPool(roomCode: string, steamAppIds: number[], addedBy: string) {
  for (const steamAppId of steamAppIds) {
    const cacheSnap = await getDoc(doc(db, "steam_cache", String(steamAppId)));
    if (!cacheSnap.exists()) {
      console.warn(`Pomijam grę ${steamAppId}: brak wpisu w steam_cache.`);
      continue;
    }
    await addGameToPool(roomCode, steamAppId, addedBy);
  }
}

// ── Plinko ────────────────────────────────────────────────────────────────
// Pod `rooms/{roomCode}/session/state`, pole `plinko` -- TEN SAM dokument co
// coinflip/wheel. Zawsze `setDoc` z `{ merge: true }` i zagnieżdżonym `{ plinko }`,
// NIGDY zapis całego dokumentu, żeby nie nadpisać coinflip/wheel.

export type PlinkoState = {
  assignments: number[]; // steamAppId per slot (index = slot); środek listy = środkowe sloty
  dropSeed: number | null;
  dropping: boolean;
  winnerSlot: number | null; // AUTORYTATYWNY wynik od klienta wyzwalającego
  triggeredAt: Timestamp | null;
};

function plinkoStateRef(roomCode: string) {
  return doc(db, "rooms", roomCode, "session", "state");
}

async function mergePlinko(roomCode: string, plinko: Record<string, unknown>) {
  await setDoc(plinkoStateRef(roomCode), { plinko }, { merge: true });
}

/** Ustawia całą tablicę przypisań slotów (zastępuje, nie scala elementów). */
export async function setPlinkoAssignments(roomCode: string, assignments: number[]) {
  await mergePlinko(roomCode, { assignments });
}

/** Klient klikający "Zrzuć" publikuje parametry startowe; wszyscy odgrywają
 * lokalnie tę samą symulację z tego seeda. Reset winnerSlot na null czyści
 * poprzedni zrzut. */
export async function triggerPlinkoDrop(roomCode: string, dropSeed: number) {
  await mergePlinko(roomCode, { dropSeed, dropping: true, winnerSlot: null, triggeredAt: serverTimestamp() });
}

/** Wywoływane WYŁĄCZNIE przez klienta wyzwalającego po zakończeniu jego
 * symulacji -- winnerSlot jest autorytatywny dla wyboru gry. */
export async function publishPlinkoWinner(roomCode: string, winnerSlot: number) {
  await mergePlinko(roomCode, { winnerSlot, dropping: false });
}

/** Odblokowuje utknięty stan "dropping" -- np. gdy klient wyzwalający zamknął
 * kartę w trakcie animacji i nigdy nie zdążył opublikować wyniku. Może
 * wywołać KAŻDY klient (idempotentne, watchdog w PlinkoScreen po timeoucie
 * od triggeredAt), nie tylko wyzwalający. */
export async function resetStuckPlinkoDrop(roomCode: string) {
  await mergePlinko(roomCode, { dropping: false, dropSeed: null });
}

export function subscribeToPlinko(roomCode: string, onChange: (plinko: PlinkoState | null) => void) {
  return onSnapshot(plinkoStateRef(roomCode), (snap) => {
    onChange(snap.exists() ? ((snap.data().plinko as PlinkoState | undefined) ?? null) : null);
  });
}

// ── Import biblioteki Steam / wspólna biblioteka ────────────────────────────

/** Wsadowo dodaje referencje gier do puli pokoju. Zakłada, że steam_cache dla
 * każdego appId już istnieje (patrz hydrateAndAddGamesToPool) -- w przeciwnym
 * razie GamePoolList pokaże tytuł "…" do czasu odświeżenia. */
export async function addGamesToPoolBatch(roomCode: string, steamAppIds: number[], addedBy: string) {
  if (steamAppIds.length === 0) return;
  // Firestore rules only allow updating status/playedAt on existing game docs, not
  // addedAt/addedBy -- a plain batch.set() over an existing doc is rejected as
  // PERMISSION_DENIED. Skip appIds already in the pool so this only ever creates.
  const existing = await getDocs(collection(db, "rooms", roomCode, "games"));
  const existingIds = new Set(existing.docs.map((d) => d.id));
  const newIds = steamAppIds.filter((id) => !existingIds.has(String(id)));
  if (newIds.length === 0) return;

  const batch = writeBatch(db);
  for (const steamAppId of newIds) {
    batch.set(doc(db, "rooms", roomCode, "games", String(steamAppId)), {
      steamAppId,
      addedBy,
      status: "active",
      addedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Dociąga /api/steam/details dla appid-ów, które nigdy nie miały wywołanego
 * appdetails (import biblioteki daje tylko appid+playtime) -- to jednocześnie
 * populuje steam_cache i, jeśli podano tagFilter, pozwala odfiltrować przed
 * dodaniem do puli (np. tylko gry wieloosobowe dla wspólnej biblioteki).
 * Sekwencyjnie: realistyczne rozmiary po filtrze backlogu to dziesiątki gier,
 * nie setki -- zob. spec sekcja 2 "Wydajność". */
export async function hydrateAndAddGamesToPool(
  roomCode: string,
  steamAppIds: number[],
  addedBy: string,
  tagFilter?: (tags: string[]) => boolean,
): Promise<number> {
  const validIds: number[] = [];
  for (const steamAppId of steamAppIds) {
    try {
      const res = await fetch(`/api/steam/details?appid=${steamAppId}`);
      if (!res.ok) continue;
      const data = (await res.json()) as { tags?: string[] };
      if (tagFilter && !tagFilter(data.tags ?? [])) continue;
      validIds.push(steamAppId);
    } catch {
      continue;
    }
  }
  await addGamesToPoolBatch(roomCode, validIds, addedBy);
  return validIds.length;
}

// ── Polubione (Explore) ──────────────────────────────────────────────────

export type LikedGame = SwipeGame & { likedBy: string[] };

function toLikedGame(likedDoc: QueryDocumentSnapshot<DocumentData>, cache: DocumentData | undefined): LikedGame {
  const d = likedDoc.data();
  return {
    ...toSwipeGame(d.steamAppId, cache),
    likedBy: d.likedBy ?? [],
  };
}

/** Zakłada, że steam_cache/{steamAppId} już istnieje (wywołaj
 * /api/steam/details przed pierwszym polubieniem danego appid). */
export async function likeGame(roomCode: string, steamAppId: number, participantId: string) {
  await setDoc(
    doc(db, "rooms", roomCode, "liked", String(steamAppId)),
    { steamAppId, likedBy: arrayUnion(participantId), addedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Nie kasuje dokumentu gdy `likedBy` staje się puste -- świadome uproszczenie,
 * pusty wpis jest odfiltrowywany po stronie klienta w subscribeToLiked. */
export async function unlikeGame(roomCode: string, steamAppId: number, participantId: string) {
  await updateDoc(doc(db, "rooms", roomCode, "liked", String(steamAppId)), {
    likedBy: arrayRemove(participantId),
  });
}

export function subscribeToLiked(roomCode: string, onChange: (games: LikedGame[]) => void) {
  return onSnapshot(collection(db, "rooms", roomCode, "liked"), async (snap) => {
    const games = await Promise.all(
      snap.docs.map(async (likedDoc) => {
        const cacheSnap = await getDoc(doc(db, "steam_cache", String(likedDoc.data().steamAppId)));
        return toLikedGame(likedDoc, cacheSnap.exists() ? cacheSnap.data() : undefined);
      }),
    );
    onChange(games.filter((g) => g.likedBy.length > 0));
  });
}
