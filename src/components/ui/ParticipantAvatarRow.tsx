"use client";

import Image from "next/image";
import type { Participant } from "@/lib/rooms";

const AVATAR_COLORS = ["#c2703d", "#2fb3a0", "#8b5cf6", "#e05e8f"];

/** Kompaktowy rząd awatarów uczestników pokoju -- widoczny podczas swipe'a/Explore
 * (dotąd widać było uczestników tylko w lobby), żeby zauważyć kiedy ktoś dołączy
 * w trakcie. Zdjęcie Steam jeśli uczestnik podpiął profil (steamAvatarUrl),
 * w przeciwnym razie pierwsza litera nicku na kolorowym tle -- ten sam wzorzec
 * co lista uczestników w RoomLobby. `title` daje natywny tooltip z nickiem
 * po najechaniu, bez nowej zależności. */
export function ParticipantAvatarRow({ participants }: { participants: Participant[] }) {
  if (participants.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center -space-x-2">
      {participants.map((p, i) => (
        <div
          key={p.participantId}
          title={p.nickname}
          className="border-background flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-xs font-bold text-white"
          style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
        >
          {p.steamAvatarUrl ? (
            <Image src={p.steamAvatarUrl} alt="" width={28} height={28} className="h-full w-full object-cover" />
          ) : (
            p.nickname[0]?.toUpperCase()
          )}
        </div>
      ))}
    </div>
  );
}
