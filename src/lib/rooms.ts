/** Warstwa dostępu do Firestore dla pokoi/uczestników/puli gier. Czysto
 * mechaniczne CRUD + subskrypcje -- logika eliminacji rundowej żyje osobno
 * w lib/elimination.ts (czysta funkcja, testowalna bez Firestore). Model
 * danych: work/active/Tumolec.md w vaulcie Obsidian. */

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  DocumentData,
  getDoc,
  onSnapshot,
  QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { SwipeGame } from "@/lib/types";
import type { SwipeDirection } from "@/lib/elimination";

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

export type Participant = { participantId: string; nickname: string };

export async function joinRoom(roomCode: string, participantId: string, nickname: string) {
  await setDoc(doc(db, "rooms", roomCode, "participants", participantId), {
    nickname,
    joinedAt: serverTimestamp(),
  });
}

export function subscribeToParticipants(roomCode: string, onChange: (p: Participant[]) => void) {
  return onSnapshot(collection(db, "rooms", roomCode, "participants"), (snap) => {
    onChange(
      snap.docs.map((d) => ({ participantId: d.id, nickname: (d.data() as { nickname: string }).nickname })),
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
    steamAppId: g.steamAppId,
    addedBy: g.addedBy,
    status: g.status,
    playedAt: g.playedAt?.toMillis?.() ?? null,
    title: cache?.name ?? "…",
    coverImageUrl: cache?.headerImageUrl,
    tags: cache?.tags ?? [],
    reviewScorePercent: cache?.reviewScorePercent ?? 0,
    reviewSummary: cache?.reviewSummary ?? "",
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

export async function startRound(roomCode: string, roundNumber: number, poolAtStart: number[]): Promise<string> {
  const roundId = `round-${roundNumber}`;
  await setDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId), {
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

export type RoundDoc = {
  roundNumber: number;
  poolAtStart: number[];
  status: "voting" | "finished";
  survivors: number[] | null;
};

export async function getRound(roomCode: string, roundId: string): Promise<RoundDoc | null> {
  const snap = await getDoc(doc(db, "rooms", roomCode, "eliminationRounds", roundId));
  return snap.exists() ? (snap.data() as RoundDoc) : null;
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

// ── Rzut monetą ───────────────────────────────────────────────────────────
// `rooms/{roomCode}/session/state` to WSPÓLNY dokument z zakładką koła fortuny
// (pole `wheel`, inny agent). Piszemy wyłącznie przez `{ merge: true }` na
// samym polu `coinflip`, żeby nigdy nie nadpisać `wheel` przy scaleniu.

export type CoinflipState = {
  result: "heads" | "tails" | null;
  spinning: boolean;
  triggeredAt: Timestamp | null;
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
