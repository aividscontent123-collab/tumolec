"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { WinnerScreen } from "@/components/room/WinnerScreen";
import { RoomTieBreaker } from "@/components/room/RoomTieBreaker";
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
  triggerReroll,
  subscribeToRerollSignal,
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
  backHref,
  allowReroll,
}: {
  roomCode: string;
  initialPool: number[];
  gameByAppId: Map<number, SwipeGame>;
  emptyMessage: string;
  backHref?: string;
  allowReroll?: boolean;
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

  // Naprawa wyścigu: gdy dwóch klientów wystartuje RÓWNOLEGLE różne sesje (żaden
  // nie widział drugiego w chwili bootstrapu -- getActiveRound wyżej to tylko
  // jednorazowy odczyt), obaj nasłuchują tu na żywo i zbiegają do sesji o
  // najniższym sessionId. Ograniczone do rundy 1: po awansie do rundy 2+ dana
  // sesja jest już "realną" grą i nie przełączamy jej pod kimś w trakcie.
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

  // Reroll: gdy KTOKOLWIEK w pokoju kliknie "Przelosuj" (WinnerScreen), WSZYSCY
  // klienci (w tym ten klikający -- subskrybują to samo pole) dostają ten sam
  // sygnał i resetują lokalny `session` do null. To ponownie odpala bootstrap
  // (tworzy nową sesję z fresh sessionId, roundNumber 1) i, jeśli kilku klientów
  // trafi na to niemal jednocześnie, ISTNIEJĄCY mechanizm zbiegania rundy 1
  // (efekt wyżej) rozwiąże ewentualny wyścig -- ta sama ścieżka co przy
  // pierwszym wejściu w Versus, nic nowego do przetestowania w elimination.ts.
  // `lastRerollRef`: pierwsza DOSTAWA-Z-WARTOŚCIĄ zaraz po subskrypcji to
  // ZNANY, stary sygnał (Firestore onSnapshot dostarcza aktualny stan
  // dokumentu od razu) -- ignorowana jako baseline, żeby zwykłe ponowne
  // wejście na ekran po WCZEŚNIEJSZYM rerollu nie wywoływało fałszywego
  // rerollu. `hasSeenAnyDeliveryRef` śledzi, czy w ogóle dostaliśmy już
  // JAKĄKOLWIEK dostawę (także `null`, gdy pole `reroll` jeszcze nigdy nie
  // istniało) -- bez tego, pierwszy w historii pokoju reroll (pole `reroll`
  // najpierw puste, potem realny sygnał) zostałby błędnie potraktowany jako
  // "baseline" i zignorowany zamiast zresetować sesję.
  const lastRerollRef = useRef<number | null>(null);
  const hasSeenAnyDeliveryRef = useRef(false);
  useEffect(() => {
    if (!allowReroll) return;
    return subscribeToRerollSignal(roomCode, (signal) => {
      // `triggeredAt` jest `null` przy optymistycznym lokalnym echo pending
      // serverTimestamp() u KLIENTA PISZĄCEGO (Firestore doręcza pending write
      // zanim serwer potwierdzi wartość) -- czekamy na kolejne doręczenie z
      // realną wartością zamiast wywalać się na .toMillis().
      if (!signal || !signal.triggeredAt) {
        hasSeenAnyDeliveryRef.current = true;
        return;
      }
      const ts = signal.triggeredAt.toMillis();
      const isFirstDelivery = !hasSeenAnyDeliveryRef.current;
      hasSeenAnyDeliveryRef.current = true;
      if (isFirstDelivery) {
        lastRerollRef.current = ts;
        return;
      }
      if (ts === lastRerollRef.current) return;
      lastRerollRef.current = ts;
      setSession(null);
    });
  }, [roomCode, allowReroll]);

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
      backHref={backHref}
      allowReroll={allowReroll}
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
  backHref,
  allowReroll,
  onAdvance,
}: {
  roomCode: string;
  sessionId: string;
  roundNumber: number;
  participantId: string;
  participants: Participant[];
  gameByAppId: Map<number, SwipeGame>;
  backHref?: string;
  allowReroll?: boolean;
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
    if (round.tieBreak?.method) return; // manual tie-break owns the finish now
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
    return (
      <WinnerScreen
        game={gameByAppId.get(round.survivors[0])}
        onReroll={allowReroll ? () => triggerReroll(roomCode) : undefined}
      />
    );
  }
  if (!round) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }

  const currentGame = myDeck.length > 0 ? gameByAppId.get(myDeck[0]) : undefined;

  function handleSwipe(direction: "left" | "right") {
    if (myDeck.length === 0) return;
    castSwipe(roomCode, roundId, participantId, myDeck[0], direction);
  }

  const progressText = `RUNDA ${roundNumber} · GRA ${Math.min(round.poolAtStart.length - myDeck.length + 1, round.poolAtStart.length)} Z ${round.poolAtStart.length}`;

  return (
    <div className="flex h-dvh flex-col">
      {backHref ? (
        <div className="flex items-center gap-3 px-[22px] pt-[18px] pb-2">
          <Link
            href={backHref}
            aria-label="Wstecz"
            className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
          >
            ‹
          </Link>
          <p className="text-text-secondary flex-1 text-center text-xs tracking-widest">{progressText}</p>
        </div>
      ) : (
        <p className="text-text-secondary pt-6 pb-2 text-center text-xs tracking-widest">{progressText}</p>
      )}
      <main className="min-h-0 flex-1 px-[22px] pb-[18px] lg:flex lg:flex-col lg:justify-center">
        {currentGame ? (
          <GameDetailLayout key={currentGame.steamAppId} game={currentGame}>
            <SwipeCard
              key={currentGame.steamAppId}
              game={currentGame}
              onSwipe={round.tieBreak?.method ? () => {} : handleSwipe}
            />
          </GameDetailLayout>
        ) : (
          <p className="text-text-secondary p-6 text-center text-sm">Czekam, aż reszta ekipy skończy…</p>
        )}
      </main>
      {round.poolAtStart.length === 2 && (
        <RoomTieBreaker
          roomCode={roomCode}
          roundId={roundId}
          participantId={participantId}
          participants={participants}
          candidates={[round.poolAtStart[0], round.poolAtStart[1]]}
          gameByAppId={gameByAppId}
          tieBreak={round.tieBreak}
        />
      )}
      {myDeck.length > 0 && !round.tieBreak?.method && (
        <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
      )}
    </div>
  );
}
