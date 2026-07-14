"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { subscribeToParticipants, subscribeToRoom, joinRoom, type Participant } from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { filterByPlaytime, type BacklogFilter } from "@/lib/steamLibrary";
import { MiniGameLauncher } from "@/components/minigames/MiniGameLauncher";

const AVATAR_COLORS = ["#c2703d", "#2fb3a0", "#8b5cf6", "#e05e8f"];

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const { participantId, nickname, save } = useParticipant(roomCode);
  const [roomName, setRoomName] = useState<string | null | undefined>(undefined);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [joinNickname, setJoinNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinProfile, setJoinProfile] = useState("");
  const [joinBacklog, setJoinBacklog] = useState<BacklogFilter>("never");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Kod QR celowo koduje publiczny URL produkcyjny (nie window.location.origin) --
    // skanuje go inny telefon, który nie dosięgnie localhosta ani preview-URL.
    QRCode.toDataURL(`https://tumolec.vercel.app/room/${roomCode}`, { margin: 1, width: 200 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [roomCode]);

  async function handleShare() {
    const url = `https://tumolec.vercel.app/room/${roomCode}`;
    if (navigator.share) {
      // Odrzucenie (użytkownik anuluje arkusz share) jest nieszkodliwe -- ignorujemy.
      try {
        await navigator.share({ title: roomName ?? "Tumolec", url });
      } catch {
        /* anulowane przez użytkownika */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard niedostępny/odrzucony -- nic więcej nie da się zrobić */
    }
  }

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
      let steamLibraryAppIds: number[] | undefined;
      if (joinProfile.trim()) {
        try {
          const res = await fetch(`/api/steam/library?profile=${encodeURIComponent(joinProfile.trim())}`);
          const data = (await res.json()) as { games?: { steamAppId: number; playtimeMinutes: number }[] };
          if (res.ok && data.games) {
            steamLibraryAppIds = filterByPlaytime(data.games as never, joinBacklog).map((g) => g.steamAppId);
          }
        } catch {
          // ponytail: brak biblioteki nie blokuje dolaczenia, wspolna biblioteka
          // po prostu nie bedzie uwzgledniac tego uczestnika
        }
      }
      await joinRoom(roomCode, id, joinNickname.trim(), steamLibraryAppIds);
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
              className="bg-card border-border rounded-xl border px-4 py-3 text-foreground"
            />
            <input
              value={joinProfile}
              onChange={(e) => setJoinProfile(e.target.value)}
              placeholder="Twój profil Steam (opcjonalnie)"
              className="bg-card border-border rounded-xl border px-4 py-3 text-foreground"
            />
            {joinProfile.trim() && (
              <ToggleChip
                value={joinBacklog}
                options={[
                  { value: "never", label: "Nigdy nie grane" },
                  { value: "under2h", label: "Poniżej 2h" },
                  { value: "under10h", label: "Poniżej 10h" },
                  { value: "abandoned", label: "Porzucone" },
                ]}
                onChange={setJoinBacklog}
                columns={2}
              />
            )}
            <button
              type="submit"
              disabled={joining}
              className="bg-accent-brand rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
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

      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt={`Kod QR pokoju ${roomCode}`}
          className="mx-auto mb-4 h-[160px] w-[160px] rounded-xl bg-white p-2"
        />
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="bg-card border-border flex w-full max-w-xs flex-col gap-2 rounded-2xl border p-4">
          {participants.map((p, i) => (
            <div key={p.participantId} className="flex items-center gap-3">
              <div
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
              >
                {p.nickname[0]?.toUpperCase()}
              </div>
              <span className="text-sm text-foreground">
                {p.nickname} {p.nickname === nickname && "(Ty)"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleShare}
          className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
        >
          {copied ? "Skopiowano link!" : "Udostępnij pokój"}
        </button>
        <Link
          href={`/room/${roomCode}/pool`}
          className="bg-accent-brand rounded-full py-3 text-center text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
        >
          Pula gier →
        </Link>
        <Link
          href={`/room/${roomCode}/history`}
          className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
        >
          Historia
        </Link>
      </div>
      <MiniGameLauncher mode={{ kind: "room", roomCode }} />
    </main>
  );
}
