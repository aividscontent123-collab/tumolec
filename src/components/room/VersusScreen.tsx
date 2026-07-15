"use client";

import { useEffect, useState } from "react";
import { EliminationRound } from "@/components/room/EliminationRound";
import { subscribeToLiked, type LikedGame } from "@/lib/rooms";

export function VersusScreen({ roomCode }: { roomCode: string }) {
  const [liked, setLiked] = useState<LikedGame[]>([]);

  useEffect(() => subscribeToLiked(roomCode, setLiked), [roomCode]);

  const gameByAppId = new Map(liked.map((g) => [g.steamAppId, g]));

  return (
    <EliminationRound
      roomCode={roomCode}
      initialPool={liked.map((g) => g.steamAppId)}
      gameByAppId={gameByAppId}
      emptyMessage="Polub co najmniej 2 gry w Explore, zanim zaczniesz Versus."
    />
  );
}
