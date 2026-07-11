"use client";

import { useEffect, useRef, useState } from "react";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { WinnerScreen } from "@/components/room/WinnerScreen";
import { useParticipant } from "@/lib/useParticipant";
import {
  subscribeToGamePool,
  subscribeToParticipants,
  getRound,
  startRound,
  subscribeToRound,
  subscribeToRoundSwipes,
  castSwipe,
  finishRound,
  type PoolGame,
  type Participant,
  type RoundDoc,
} from "@/lib/rooms";
import { resolveRound, type Swipe } from "@/lib/elimination";

/** Talia swipe + orkiestracja rund eliminacji. Mechanika (odcinanie najsłabszej
 * połowy, remisy) liczona w lib/elimination.ts -- ten komponent tylko łączy ją
 * z Firestore i UI. Szczegóły: work/active/Tumolec.md w vaulcie Obsidian. */
export function SwipeScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [poolGames, setPoolGames] = useState<PoolGame[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const bootstrapped = useRef(false);

  useEffect(() => subscribeToGamePool(roomCode, setPoolGames), [roomCode]);
  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);

  // Rozpoczyna rundę 1 przy pierwszej okazji, gdy pula jest gotowa i runda
  // jeszcze nie istnieje (np. w wyniku odświeżenia strony przez inny klient).
  useEffect(() => {
    if (bootstrapped.current || roundNumber !== 1) return;
    const active = poolGames.filter((g) => g.status === "active").map((g) => g.steamAppId);
    if (active.length < 2) return;
    bootstrapped.current = true;
    getRound(roomCode, "round-1").then((existing) => {
      if (!existing) startRound(roomCode, 1, active);
    });
  }, [roomCode, poolGames, roundNumber]);

  const activeGames = poolGames.filter((g) => g.status === "active");
  const gameByAppId = new Map(poolGames.map((g) => [g.steamAppId, g]));

  if (!participantId) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dołącz do pokoju w lobby.</p>;
  }
  if (activeGames.length < 2) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dodaj co najmniej 2 gry w puli.</p>;
  }

  return (
    <RoundVoting
      // `key` wymusza pełny remount przy zmianie rundy -- inaczej stan `round`/
      // `swipes` dwóch niezależnych subskrypcji mógłby się na chwilę rozjechać
      // (nowy `round` już z rundy N+1, `swipes` jeszcze z N), co raz spowodowało
      // rozstrzygnięcie zwycięzcy na nieaktualnych głosach z poprzedniej rundy.
      key={roundNumber}
      roomCode={roomCode}
      roundNumber={roundNumber}
      participantId={participantId}
      participants={participants}
      gameByAppId={gameByAppId}
      onAdvance={() => setRoundNumber((n) => n + 1)}
    />
  );
}

function RoundVoting({
  roomCode,
  roundNumber,
  participantId,
  participants,
  gameByAppId,
  onAdvance,
}: {
  roomCode: string;
  roundNumber: number;
  participantId: string;
  participants: Participant[];
  gameByAppId: Map<number, PoolGame>;
  onAdvance: () => void;
}) {
  const [round, setRound] = useState<RoundDoc | null>(null);
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const roundId = `round-${roundNumber}`;

  useEffect(() => {
    const unsubRound = subscribeToRound(roomCode, roundId, (r) => {
      setRound(r);
      if (r?.status === "finished" && r.survivors && r.survivors.length > 1) {
        onAdvance();
      }
    });
    const unsubSwipes = subscribeToRoundSwipes(roomCode, roundId, setSwipes);
    return () => {
      unsubRound();
      unsubSwipes();
    };
  }, [roomCode, roundId, onAdvance]);

  // Gdy wszyscy skończą głosować w tej rundzie, którykolwiek klient ją zamyka.
  // Bezpieczne przy wyścigu wielu klientów: resolveRound jest czystą funkcją
  // tych samych danych, więc każdy policzy identyczny wynik.
  useEffect(() => {
    if (!round || round.status !== "voting" || participants.length === 0) return;
    if (swipes.length < round.poolAtStart.length * participants.length) return;

    const result = resolveRound(round.poolAtStart, swipes);
    let finalSurvivors: number[] | null = null;
    if (result.status === "winner") {
      finalSurvivors = [result.steamAppId];
    } else if (result.status === "advance") {
      finalSurvivors = result.survivors;
    } else if (result.status === "tie-break") {
      // ponytail: remis rozstrzygamy deterministycznie (najniższy appid), nie
      // prawdziwym rzutem monetą -- integracja z zakładką moneta to Faza 3.
      // Deterministyczne = bezpieczne przy kilku klientach liczących naraz.
      const brokenTie = [...result.tiedForCutoff].sort((a, b) => a - b).slice(0, result.slotsAvailable);
      finalSurvivors = [...result.survivors, ...brokenTie];
    }
    if (!finalSurvivors) return;

    finishRound(roomCode, roundId, finalSurvivors);
    if (finalSurvivors.length > 1) {
      startRound(roomCode, roundNumber + 1, finalSurvivors);
    }
  }, [round, swipes, participants, roomCode, roundId, roundNumber]);

  const myVotes = new Set(
    swipes.filter((s) => s.participantId === participantId).map((s) => s.steamAppId),
  );
  const myDeck = round?.poolAtStart.filter((id) => !myVotes.has(id)) ?? [];

  if (round?.status === "finished" && round.survivors?.length === 1) {
    return <WinnerScreen game={gameByAppId.get(round.survivors[0])} />;
  }
  if (!round) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }
  if (myDeck.length === 0) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">Czekam, aż reszta ekipy skończy…</p>
    );
  }

  const currentGame = gameByAppId.get(myDeck[0]);
  if (!currentGame) return null;

  function handleSwipe(direction: "left" | "right") {
    castSwipe(roomCode, roundId, participantId, myDeck[0], direction);
  }

  return (
    <div className="flex h-dvh flex-col">
      <p className="text-text-secondary pt-6 pb-2 text-center text-xs tracking-widest">
        RUNDA {roundNumber} · GRA {round.poolAtStart.length - myDeck.length + 1} Z {round.poolAtStart.length}
      </p>
      <main className="min-h-0 flex-1 px-[22px] pb-[18px]">
        <div className="relative h-full">
          <SwipeCard key={currentGame.steamAppId} game={currentGame} onSwipe={handleSwipe} />
        </div>
      </main>
      <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
    </div>
  );
}
