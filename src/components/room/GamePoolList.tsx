"use client";

import Image from "next/image";
import type { PoolGame } from "@/lib/rooms";
import { setGameStatus } from "@/lib/rooms";

export function GamePoolList({ roomCode, games }: { roomCode: string; games: PoolGame[] }) {
  if (games.length === 0) {
    return (
      <p className="text-text-secondary py-8 text-center text-sm">
        Pula jest pusta — dodaj pierwszą grę powyżej.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {games.map((game) => (
        <li
          key={game.steamAppId}
          className="flex items-center gap-3 rounded-xl border p-3"
          style={{ backgroundColor: "oklch(0.18 0.02 265)", borderColor: "oklch(0.28 0.02 265)" }}
        >
          {game.coverImageUrl && (
            <Image
              src={game.coverImageUrl}
              alt=""
              width={96}
              height={48}
              className="h-12 w-24 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{game.title}</p>
            <p style={{ color: "var(--rating)" }} className="text-xs">
              {game.reviewScorePercent}% {game.reviewSummary}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setGameStatus(roomCode, game.steamAppId, "played")}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: "oklch(0.24 0.02 265)", color: "var(--text-secondary)" }}
            >
              Zagrane
            </button>
            <button
              type="button"
              onClick={() => setGameStatus(roomCode, game.steamAppId, "removed")}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: "oklch(0.24 0.02 265)", color: "var(--pass)" }}
            >
              Usuń
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
