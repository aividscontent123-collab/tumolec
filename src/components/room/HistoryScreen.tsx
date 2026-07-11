"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { subscribeToGamePool, type PoolGame } from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import { buildHistory } from "@/lib/history";

function pluralizeGry(n: number): string {
  if (n === 1) return "grę";
  if (n >= 2 && n <= 4) return "gry";
  return "gier";
}

export function HistoryScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [games, setGames] = useState<PoolGame[]>([]);

  useEffect(() => {
    return subscribeToGamePool(roomCode, setGames);
  }, [roomCode]);

  const history = buildHistory(games);

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
        <h1 className="font-heading text-[18px] font-bold text-foreground">Historia</h1>
      </div>

      {history.totalPlayed === 0 ? (
        <p className="text-text-secondary py-8 text-center text-sm">
          Jeszcze nie zagraliście w żadną grę. Oznacz grę jako „Zagrane” w puli.
        </p>
      ) : (
        <>
          <p className="text-sm font-bold text-foreground">
            Zagraliście razem w {history.totalPlayed} {pluralizeGry(history.totalPlayed)} 🎮
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul className="flex flex-col gap-3">
              {history.games.map((game) => (
                <li
                  key={game.steamAppId}
                  className="bg-card border-border flex items-center gap-3 rounded-xl border p-3"
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
                    <p className="text-text-secondary text-xs">
                      {game.playedAt
                        ? new Date(game.playedAt).toLocaleDateString("pl-PL", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "przed chwilą"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </main>
  );
}
