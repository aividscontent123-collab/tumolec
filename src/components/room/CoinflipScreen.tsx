"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subscribeToCoinflip, type CoinflipState } from "@/lib/rooms";
import { CoinFlip3D } from "@/components/coinflip/CoinFlip3D";
import { FlipButton } from "@/components/coinflip/FlipButton";

export function CoinflipScreen({ roomCode }: { roomCode: string }) {
  const [coinflip, setCoinflip] = useState<CoinflipState | null>(null);

  useEffect(() => subscribeToCoinflip(roomCode, setCoinflip), [roomCode]);

  const resultLabel =
    coinflip?.result === "heads" ? "Orzeł" : coinflip?.result === "tails" ? "Reszka" : null;

  return (
    <main className="flex h-dvh flex-col gap-6 px-[22px] pt-[18px] pb-[30px]">
      <div className="flex items-center gap-3">
        <Link
          href={`/room/${roomCode}`}
          aria-label="Wstecz"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: "oklch(0.24 0.02 265)" }}
        >
          ‹
        </Link>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Rzut monetą</h1>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <CoinFlip3D coinflip={coinflip} />
        <p className="text-text-secondary text-sm">
          {resultLabel ? `Wynik: ${resultLabel}` : "Naciśnij, żeby rzucić"}
        </p>
      </div>

      <FlipButton roomCode={roomCode} />
    </main>
  );
}
