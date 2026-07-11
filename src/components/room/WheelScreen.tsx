"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subscribeToWheel, finishWheelSpin, type WheelState } from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import { WheelCanvas } from "@/components/wheel/WheelCanvas";
import { WheelControls } from "@/components/wheel/WheelControls";

const EMPTY_WHEEL: WheelState = { entries: [], spinning: false, winner: null, extraTurns: null };

export function WheelScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [wheel, setWheel] = useState<WheelState>(EMPTY_WHEEL);

  useEffect(() => subscribeToWheel(roomCode, (w) => setWheel(w ?? EMPTY_WHEEL)), [roomCode]);

  if (!participantId) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">
        Wróć do <Link href={`/room/${roomCode}`} className="underline">lobby</Link>, żeby dołączyć do pokoju.
      </p>
    );
  }

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
        <h1 className="font-heading text-[18px] font-bold text-foreground">Koło fortuny</h1>
      </div>

      <WheelCanvas wheel={wheel} onSpinAnimationComplete={() => finishWheelSpin(roomCode)} />

      {wheel.winner && !wheel.spinning && (
        <p className="text-center text-sm text-foreground">
          Wygrywa: <span className="font-bold">{wheel.winner}</span>
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <WheelControls roomCode={roomCode} wheel={wheel} />
      </div>
    </main>
  );
}
