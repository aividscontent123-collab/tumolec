"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { subscribeToLiked, unlikeGame, likeGame, signalVersusStart, type LikedGame } from "@/lib/rooms";
import { AddGameForm } from "@/components/room/AddGameForm";
import { useParticipant } from "@/lib/useParticipant";
import { cn } from "@/lib/utils";

export function LikedScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const router = useRouter();
  const [games, setGames] = useState<LikedGame[]>([]);

  useEffect(() => subscribeToLiked(roomCode, setGames), [roomCode]);

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
          href={`/room/${roomCode}/explore`}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </Link>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Polubione</h1>
      </div>

      <AddGameForm roomCode={roomCode} participantId={participantId} addFn={(rc, id, pid) => likeGame(rc, id, pid)} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {games.length === 0 ? (
          <p className="text-text-secondary py-8 text-center text-sm">
            Brak polubionych gier — wróć do Explore albo dopisz coś ręcznie powyżej.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {games.map((game) => (
              <li key={game.steamAppId} className="bg-card border-border flex items-center gap-3 rounded-xl border p-3">
                {game.coverImageUrl && (
                  <Image src={game.coverImageUrl} alt="" width={96} height={48} className="h-12 w-24 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{game.title}</p>
                  <p className="text-text-secondary text-xs">{game.likedBy.length} polubień</p>
                </div>
                <button
                  type="button"
                  onClick={() => unlikeGame(roomCode, game.steamAppId, participantId)}
                  className="bg-secondary text-pass shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                >
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        disabled={games.length < 2}
        onClick={() => {
          if (participantId) signalVersusStart(roomCode, participantId);
          router.push(`/room/${roomCode}/versus`);
        }}
        className={cn(
          "rounded-full py-3 text-center text-sm font-bold",
          games.length >= 2
            ? "bg-accent-brand text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
            : "bg-secondary text-text-secondary",
        )}
      >
        {games.length >= 2 ? "Rozpocznij Versus →" : "Polub co najmniej 2 gry"}
      </button>
    </main>
  );
}
