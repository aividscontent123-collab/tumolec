"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subscribeToParticipants, subscribeToRoom, type Participant } from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";

const AVATAR_COLORS = ["#c2703d", "#2fb3a0", "#8b5cf6", "#e05e8f"];

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const { nickname } = useParticipant(roomCode);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    const unsubRoom = subscribeToRoom(roomCode, (data) => setRoomName(data?.name ?? null));
    const unsubParticipants = subscribeToParticipants(roomCode, setParticipants);
    return () => {
      unsubRoom();
      unsubParticipants();
    };
  }, [roomCode]);

  if (roomName === null) {
    return <p className="text-text-secondary p-6 text-center text-sm">Ładowanie pokoju…</p>;
  }

  return (
    <main className="flex h-dvh flex-col px-[22px] pt-[18px] pb-[30px]">
      <h1 className="font-heading text-center text-[22px] font-bold text-foreground">
        {roomName}
      </h1>
      <p className="text-text-secondary mb-6 text-center text-xs tracking-widest">
        KOD POKOJU: {roomCode}
      </p>

      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        {participants.map((p) => (
          <div key={p.participantId} className="flex items-center gap-3">
            <div
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{
                backgroundColor:
                  AVATAR_COLORS[participants.indexOf(p) % AVATAR_COLORS.length],
              }}
            >
              {p.nickname[0]?.toUpperCase()}
            </div>
            <span className="text-sm text-foreground">
              {p.nickname} {p.nickname === nickname && "(Ty)"}
            </span>
          </div>
        ))}
      </div>

      <Link
        href={`/room/${roomCode}/pool`}
        className="rounded-full py-3 text-center text-sm font-bold text-white"
        style={{ backgroundColor: "var(--accent-brand)", boxShadow: "0 8px 24px var(--accent-brand-soft)" }}
      >
        Pula gier →
      </Link>
    </main>
  );
}
