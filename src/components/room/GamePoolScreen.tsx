"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subscribeToGamePool, type PoolGame } from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import { AddGameForm } from "@/components/room/AddGameForm";
import { GamePoolList } from "@/components/room/GamePoolList";
import { cn } from "@/lib/utils";

export function GamePoolScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [games, setGames] = useState<PoolGame[]>([]);

  useEffect(() => {
    return subscribeToGamePool(roomCode, setGames);
  }, [roomCode]);

  const activeGames = games.filter((g) => g.status === "active");

  if (!participantId) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">
        Wróć do <Link href={`/room/${roomCode}`} className="underline">lobby</Link>, żeby dołączyć do pokoju.
      </p>
    );
  }

  return (
    <main className="flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[30px]">
      <div className="flex items-center gap-3">
        <Link
          href={`/room/${roomCode}`}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </Link>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Pula gier</h1>
      </div>

      <AddGameForm roomCode={roomCode} participantId={participantId} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <GamePoolList roomCode={roomCode} games={activeGames} />
      </div>

      <Link
        href={`/room/${roomCode}/swipe`}
        aria-disabled={activeGames.length < 2}
        className={cn(
          "rounded-full py-3 text-center text-sm font-bold",
          activeGames.length >= 2
            ? "bg-accent-brand text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
            : "bg-secondary text-text-secondary pointer-events-none",
        )}
      >
        {activeGames.length >= 2 ? "Zacznij głosowanie →" : "Dodaj co najmniej 2 gry"}
      </Link>
    </main>
  );
}
