"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { subscribeToParticipants, subscribeToRoom, joinRoom, type Participant } from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";

const AVATAR_COLORS = ["#c2703d", "#2fb3a0", "#8b5cf6", "#e05e8f"];

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const { participantId, nickname, save } = useParticipant(roomCode);
  const [roomName, setRoomName] = useState<string | null | undefined>(undefined);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [joinNickname, setJoinNickname] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const unsubRoom = subscribeToRoom(roomCode, (data) => setRoomName(data?.name ?? null));
    const unsubParticipants = subscribeToParticipants(roomCode, setParticipants);
    return () => {
      unsubRoom();
      unsubParticipants();
    };
  }, [roomCode]);

  if (roomName === undefined) {
    return <p className="text-text-secondary p-6 text-center text-sm">Ładowanie pokoju…</p>;
  }
  if (roomName === null) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">
        Nie znaleziono pokoju o kodzie {roomCode}.
      </p>
    );
  }

  // Ktoś otworzył link do pokoju bezpośrednio, bez przejścia przez ekran
  // dołączania na stronie głównej -- pytamy o pseudonim tutaj.
  if (!participantId) {
    async function handleJoin(e: React.FormEvent) {
      e.preventDefault();
      if (!joinNickname.trim()) return;
      setJoining(true);
      const id = crypto.randomUUID();
      await joinRoom(roomCode, id, joinNickname.trim());
      save(id, joinNickname.trim());
      setJoining(false);
    }

    return (
      <main className="flex h-dvh flex-col items-center justify-center px-[22px]">
        <div className="w-full max-w-sm">
          <h1 className="font-heading mb-1 text-center text-[22px] font-bold text-foreground">
            {roomName}
          </h1>
          <p className="text-text-secondary mb-6 text-center text-sm">Dołącz, żeby głosować.</p>
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <input
              value={joinNickname}
              onChange={(e) => setJoinNickname(e.target.value)}
              placeholder="Twój pseudonim"
              maxLength={24}
              className="rounded-xl border px-4 py-3 text-foreground"
              style={{ backgroundColor: "oklch(0.2 0.02 265)", borderColor: "oklch(0.3 0.02 265)" }}
            />
            <button
              type="submit"
              disabled={joining}
              className="rounded-full py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--accent-brand)", boxShadow: "0 8px 24px var(--accent-brand-soft)" }}
            >
              Dołącz
            </button>
          </form>
        </div>
      </main>
    );
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

      <div className="flex gap-3">
        <Link
          href={`/room/${roomCode}/pool`}
          className="flex-1 rounded-full py-3 text-center text-sm font-bold text-white"
          style={{ backgroundColor: "var(--accent-brand)", boxShadow: "0 8px 24px var(--accent-brand-soft)" }}
        >
          Pula gier →
        </Link>
        <Link
          href={`/room/${roomCode}/wheel`}
          className="flex-1 rounded-full py-3 text-center text-sm font-bold text-foreground"
          style={{ backgroundColor: "oklch(0.24 0.02 265)" }}
        >
          Koło fortuny
        </Link>
      </div>
    </main>
  );
}
