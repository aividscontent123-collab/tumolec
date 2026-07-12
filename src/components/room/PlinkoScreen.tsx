"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  subscribeToGamePool,
  subscribeToPlinko,
  setPlinkoAssignments,
  triggerPlinkoDrop,
  publishPlinkoWinner,
  setGameStatus,
  type PoolGame,
  type PlinkoState,
} from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import { PlinkoBoard } from "@/components/plinko/PlinkoBoard";
import { PlinkoSetup } from "@/components/plinko/PlinkoSetup";
import { WinnerScreen } from "@/components/room/WinnerScreen";

const EMPTY: PlinkoState = {
  assignments: [],
  dropSeed: null,
  dropping: false,
  winnerSlot: null,
  triggeredAt: null,
};

export function PlinkoScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [poolGames, setPoolGames] = useState<PoolGame[]>([]);
  const [plinko, setPlinko] = useState<PlinkoState>(EMPTY);
  // Tylko klient, który kliknął "Zrzuć", publikuje wynik + oznacza grę zagraną.
  const triggeredByMe = useRef(false);

  useEffect(() => subscribeToGamePool(roomCode, setPoolGames), [roomCode]);
  useEffect(() => subscribeToPlinko(roomCode, (p) => setPlinko(p ?? EMPTY)), [roomCode]);

  const activeGames = poolGames.filter((g) => g.status === "active");
  const gameByAppId = new Map(poolGames.map((g) => [g.steamAppId, g]));

  // Inicjalizacja przypisań: gdy puste, ustaw aktywne gry w kolejności puli.
  useEffect(() => {
    if (!participantId) return;
    if (plinko.assignments.length === 0 && activeGames.length >= 2) {
      setPlinkoAssignments(roomCode, activeGames.map((g) => g.steamAppId));
    }
  }, [participantId, roomCode, plinko.assignments.length, activeGames]);

  if (!participantId) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">
        Wróć do <Link href={`/room/${roomCode}`} className="underline">lobby</Link>, żeby dołączyć do pokoju.
      </p>
    );
  }
  if (activeGames.length < 2) {
    return <p className="text-text-secondary p-6 text-center text-sm">Dodaj co najmniej 2 gry w puli.</p>;
  }

  function handleDrop() {
    triggeredByMe.current = true;
    triggerPlinkoDrop(roomCode, Math.floor(Math.random() * 1_000_000));
  }

  function handleSettled(slot: number) {
    if (!triggeredByMe.current) return; // tylko wyzwalający publikuje wynik
    triggeredByMe.current = false;
    publishPlinkoWinner(roomCode, slot);
    const winnerAppId = plinko.assignments[slot];
    if (winnerAppId != null) setGameStatus(roomCode, winnerAppId, "played");
  }

  const winnerGame =
    plinko.winnerSlot != null && !plinko.dropping
      ? gameByAppId.get(plinko.assignments[plinko.winnerSlot])
      : undefined;

  if (winnerGame) return <WinnerScreen game={winnerGame} />;

  return (
    <main className="flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[30px]">
      <div className="flex items-center gap-3">
        <Link
          href={`/room/${roomCode}`}
          aria-label="Wstecz"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: "oklch(0.24 0.02 265)" }}
        >
          ‹
        </Link>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Plinko</h1>
      </div>

      <PlinkoBoard
        assignments={plinko.assignments}
        dropSeed={plinko.dropSeed}
        dropping={plinko.dropping}
        onSettled={handleSettled}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <PlinkoSetup roomCode={roomCode} plinko={plinko} activeGames={activeGames} onDrop={handleDrop} />
      </div>
    </main>
  );
}
