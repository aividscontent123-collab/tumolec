"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subscribeToVersusStart, type Participant, type VersusStartSignal } from "@/lib/rooms";

const VERSUS_START_STALE_MS = 5 * 60 * 1000; // baner znika po 5 minutach, żeby nie wisieć wiecznie po jednorazowym starcie

/** Nieblokujący baner "X rozpoczyna Versus" -- subskrybuje sygnał samodzielnie,
 * więc dowolny ekran, na którym uczestnik może realnie siedzieć w tym momencie
 * (lobby, Explore -- czyli w trakcie faktycznego swipe'a, nie tylko w lobby),
 * dostaje go jednym dopisaniem komponentu. Nigdy nie pokazuje się
 * triggerującemu, znika po 5 minutach. */
export function VersusStartBanner({
  roomCode,
  participantId,
  participants,
  className = "",
}: {
  roomCode: string;
  participantId: string | null;
  participants: Participant[];
  className?: string;
}) {
  const [versusStart, setVersusStart] = useState<VersusStartSignal | null>(null);

  useEffect(() => subscribeToVersusStart(roomCode, setVersusStart), [roomCode]);

  const starter =
    versusStart &&
    versusStart.triggeredBy !== participantId &&
    Date.now() - versusStart.triggeredAt.toMillis() < VERSUS_START_STALE_MS
      ? (participants.find((p) => p.participantId === versusStart.triggeredBy)?.nickname ?? "Ktoś")
      : null;

  if (!starter) return null;

  return (
    <div className={`bg-accent-brand/15 border-accent-brand flex items-center justify-between gap-3 rounded-xl border p-3 ${className}`}>
      <span className="text-sm text-foreground">{starter} rozpoczyna Versus</span>
      <Link
        href={`/room/${roomCode}/versus`}
        className="bg-accent-brand shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white"
      >
        Dołącz
      </Link>
    </div>
  );
}
