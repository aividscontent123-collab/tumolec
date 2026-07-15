"use client";

import { useEffect, useRef, useState } from "react";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { WinnerScreen } from "@/components/room/WinnerScreen";
import { useParticipant } from "@/lib/useParticipant";
import {
  subscribeToParticipants,
  getActiveRound,
  startRound,
  subscribeToRound,
  subscribeToRoundSwipes,
  subscribeToEliminationRounds,
  castSwipe,
  finishRound,
  type Participant,
  type RoundDoc,
} from "@/lib/rooms";
import { resolveRound, breakTieDeterministically, type Swipe } from "@/lib/elimination";
import type { SwipeGame } from "@/lib/types";

/** Silnik rund eliminacji (swipe + orkiestracja), wydzielony z dawnego
 * SwipeScreen.tsx żeby dało się go uruchomić na dowolnej puli -- dzisiejsza
 * ręczna pula (games, status=active) i Versus (liked) to teraz dwa cienkie
 * wrappery nad tym samym silnikiem. Mechanika (odcinanie najsłabszej połowy,
 * remisy) liczona w lib/elimination.ts. Rundy scope'owane przez sessionId,
 * jak dawniej -- szczegóły w komentarzach RoundVoting poniżej. */
export function EliminationRound({
  roomCode,
  initialPool,
  gameByAppId,
  emptyMessage,
}: {
  roomCode: string;
  initialPool: number[];
  gameByAppId: Map<number, SwipeGame>;
  emptyMessage: string;
}) {
  const { participantId } = useParticipant(roomCode);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [session, setSession] = useState<{ sessionId: string; roundNumber: number } | null>(null);
  const bootstrapping = useRef(false);

  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);

  useEffect(() => {
    if (session || bootstrapping.current) return;
    if (initialPool.length < 2) return;
    bootstrapping.current = true;
    getActiveRound(roomCode).then((existing) => {
      if (existing) {
        setSession({ sessionId: existing.sessionId, roundNumber: existing.roundNumber });
      } else {
        const sessionId = crypto.randomUUID();
        startRound(roomCode, sessionId, 1, initialPool);
        setSession({ sessionId, roundNumber: 1 });
      }
      bootstrapping.current = false;
    });
  }, [roomCode, initialPool, session]);

  useEffect(() => {
    if (!session || session.roundNumber !== 1) return;
    return subscribeToEliminationRounds(roomCode, (rounds) => {
      const voting = rounds.filter((r) => r.status === "voting" && r.roundNumber === 1);
      if (voting.length === 0) return;
      const canonical = [...voting].sort((a, b) => a.sessionId.localeCompare(b.sessionId))[0].sessionId;
      if (canonical !== session.sessionId) {
        setSession({ sessionId: canonical, roundNumber: 1 });
      }
    });
  }, [roomCode, session]);

  if (!participantId) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dołącz do pokoju w lobby.</p>;
  }
  if (initialPool.length < 2) {
    return <p className="text-text-secondary p-6 text-center text-sm">{emptyMessage}</p>;
  }
  if (!session) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }

  return (
    <RoundVoting
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
  gameByAppId: Map<number, SwipeGame>;
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
      const brokenTie = breakTieDeterministically(result.tiedForCutoff, result.slotsAvailable);
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
      <main className="min-h-0 flex-1 px-[22px] pb-[18px] lg:flex lg:flex-col lg:justify-center">
        <GameDetailLayout key={currentGame.steamAppId} game={currentGame}>
          <SwipeCard key={currentGame.steamAppId} game={currentGame} onSwipe={handleSwipe} />
        </GameDetailLayout>
      </main>
      <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
    </div>
  );
}
