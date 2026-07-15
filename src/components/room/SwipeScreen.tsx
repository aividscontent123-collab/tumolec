"use client";

import { useEffect, useState } from "react";
import { EliminationRound } from "@/components/room/EliminationRound";
import { subscribeToGamePool, type PoolGame } from "@/lib/rooms";

/** Dzisiejsza pula (games, status=active) wpięta w generyczny silnik rund.
 * Sam silnik: EliminationRound.tsx. */
export function SwipeScreen({ roomCode }: { roomCode: string }) {
  const [poolGames, setPoolGames] = useState<PoolGame[]>([]);

  useEffect(() => subscribeToGamePool(roomCode, setPoolGames), [roomCode]);

  const activeGames = poolGames.filter((g) => g.status === "active");
  const gameByAppId = new Map(poolGames.map((g) => [g.steamAppId, g]));

  return (
    <EliminationRound
      roomCode={roomCode}
      initialPool={activeGames.map((g) => g.steamAppId)}
      gameByAppId={gameByAppId}
      emptyMessage="Dodaj co najmniej 2 gry w puli."
    />
  );
}
