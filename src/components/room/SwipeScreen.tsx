"use client";

import { useEffect, useRef, useState } from "react";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { WinnerScreen } from "@/components/room/WinnerScreen";
import { useParticipant } from "@/lib/useParticipant";
import {
  subscribeToGamePool,
  subscribeToParticipants,
  getActiveRound,
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
 * z Firestore i UI. Rundy są scope'owane przez sessionId (roundId =
 * `${sessionId}-round-${n}`), więc kolejna rozgrywka w tym samym pokoju dostaje
 * świeże dokumenty i świeże podkolekcje swipe'ów. Szczegóły: work/active/Tumolec.md. */
export function SwipeScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [poolGames, setPoolGames] = useState<PoolGame[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [session, setSession] = useState<{ sessionId: string; roundNumber: number } | null>(null);
  const bootstrapping = useRef(false);

  useEffect(() => subscribeToGamePool(roomCode, setPoolGames), [roomCode]);
  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);

  // Ustala sesję: przejmuje trwającą rundę "voting", albo startuje nową sesję.
  useEffect(() => {
    if (session || bootstrapping.current) return;
    const active = poolGames.filter((g) => g.status === "active").map((g) => g.steamAppId);
    if (active.length < 2) return;
    bootstrapping.current = true;
    getActiveRound(roomCode).then((existing) => {
      if (existing) {
        setSession({ sessionId: existing.sessionId, roundNumber: existing.roundNumber });
      } else {
        const sessionId = crypto.randomUUID();
        startRound(roomCode, sessionId, 1, active);
        setSession({ sessionId, roundNumber: 1 });
      }
      bootstrapping.current = false;
    });
  }, [roomCode, poolGames, session]);

  const gameByAppId = new Map(poolGames.map((g) => [g.steamAppId, g]));
  const activeGames = poolGames.filter((g) => g.status === "active");

  if (!participantId) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dołącz do pokoju w lobby.</p>;
  }
  if (activeGames.length < 2) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dodaj co najmniej 2 gry w puli.</p>;
  }
  if (!session) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }

  return (
    <RoundVoting
      // `key` wymusza pełny remount przy zmianie rundy -- inaczej stan `round`/
      // `swipes` dwóch niezależnych subskrypcji mógłby się na chwilę rozjechać.
      key={`${session.sessionId}-${session.roundNumber}`}
      roomCode={roomCode}
      sessionId={session.sessionId}
      roundNumber={session.roundNumber}
      participantId={participantId}
      participants={participants}
      gameByAppId={gameByAppId}
      onAdvance={() => setSession((s) => (s ? { ...s, roundNumber: s.roundNumber + 1 } : s))}
    />
  );
}

function RoundVoting({
  roomCode,
  sessionId,
  roundNumber,
  participantId,
  participants,
  gameByAppId,
  onAdvance,
}: {
  roomCode: string;
  sessionId: string;
  roundNumber: number;
  participantId: string;
  participants: Participant[];
  gameByAppId: Map<number, PoolGame>;
  onAdvance: () => void;
}) {
  const [round, setRound] = useState<RoundDoc | null>(null);
  const [swipes, setSwipes] = useState<Swipe[]>([]);
  const roundId = `${sessionId}-round-${roundNumber}`;

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
  // Bezpieczne przy wyścigu: resolveRound jest czystą funkcją tych samych danych.
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
      // TODO(Faza 3+): coinflip jako tie-breaker nie jest tu podpięty (patrz
      // komentarz przy finishRound w lib/rooms.ts). Na razie deterministyczne
      // rozstrzygnięcie (najniższy appid) -- bezpieczne przy wyścigu.
      const brokenTie = [...result.tiedForCutoff].sort((a, b) => a - b).slice(0, result.slotsAvailable);
      finalSurvivors = [...result.survivors, ...brokenTie];
    }
    if (!finalSurvivors) return;

    finishRound(roomCode, roundId, finalSurvivors);
    if (finalSurvivors.length > 1) {
      startRound(roomCode, sessionId, roundNumber + 1, finalSurvivors);
    }
  }, [round, swipes, participants, roomCode, roundId, sessionId, roundNumber]);

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
