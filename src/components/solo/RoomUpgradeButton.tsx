"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom, likeGame, setExploreGenreFilter } from "@/lib/rooms";
import { getLocalLiked } from "@/lib/localLiked";
import { useRoomShare } from "@/lib/useRoomShare";

type Props =
  | { source: "library"; libraryAppIds: number[]; genreFilter: string[] }
  | { source: "catalog"; genreFilter: string[] };

/** Podnosi bieżącą sesję solo (biblioteka LUB katalog) do współdzielonego
 * pokoju: tworzy pokój, dołącza hosta, przenosi polubione gry
 * (rooms/{code}/liked) i bieżący filtr gatunku. Świadomie NIE przenosi
 * historii "pokazanych, ale niepolubionych" gier z sesji solo -- nowy
 * uczestnik i tak zaczyna od zera, zob. spec. Po utworzeniu zostaje na
 * miejscu i pokazuje QR/kod/link zamiast nawigować od razu -- host sam
 * decyduje kiedy przejść do wspólnego Eksploruj. */
export function RoomUpgradeButton(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { qrDataUrl, copied, handleShare } = useRoomShare(roomCode ?? "", "Wieczór gier");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const code = await createRoom("Wieczór gier");
      const id = crypto.randomUUID();
      const libraryAppIds = props.source === "library" ? props.libraryAppIds : undefined;
      await joinRoom(code, id, trimmed, libraryAppIds);
      localStorage.setItem(`tumolec:${code}:participantId`, id);
      localStorage.setItem(`tumolec:${code}:nickname`, trimmed);
      for (const appId of getLocalLiked()) {
        await likeGame(code, appId, id);
      }
      if (props.genreFilter.length > 0) {
        await setExploreGenreFilter(code, props.genreFilter);
      }
      setRoomCode(code);
    } catch {
      setError("Nie udało się utworzyć pokoju. Spróbuj ponownie.");
    } finally {
      setCreating(false);
    }
  }

  function handleContinue() {
    if (!roomCode) return;
    const roomSource = props.source === "library" ? "shared" : "catalog";
    router.push(`/room/${roomCode}/explore?source=${roomSource}&autostart=1`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Co-op / Dodaj znajomego"
        className="bg-secondary fixed bottom-6 left-4 z-20 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
      >
        🤝
      </button>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={() => setOpen(false)}>
          <div className="bg-background w-full rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold text-foreground">Co-op / Dodaj znajomego</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zamknij"
                className="text-text-secondary text-2xl"
              >
                ✕
              </button>
            </div>

            {!roomCode ? (
              <form onSubmit={handleCreate} className="flex flex-col gap-3">
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Twój pseudonim"
                  maxLength={24}
                  className="border-border rounded-lg border bg-transparent px-3 py-2 text-sm text-foreground"
                />
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-accent-brand rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {creating ? "Tworzę…" : "Stwórz pokój"}
                </button>
                {error && <p className="text-pass text-sm">{error}</p>}
              </form>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt={`Kod QR pokoju ${roomCode}`}
                    className="h-[160px] w-[160px] rounded-xl bg-white p-2"
                  />
                )}
                <p className="text-text-secondary text-center text-xs tracking-widest">KOD POKOJU: {roomCode}</p>
                <button
                  type="button"
                  onClick={handleShare}
                  className="bg-secondary w-full rounded-full py-3 text-center text-sm font-bold text-foreground"
                >
                  {copied ? "Skopiowano link!" : "Udostępnij pokój"}
                </button>
                <button
                  type="button"
                  onClick={handleContinue}
                  className="bg-accent-brand w-full rounded-full py-3 text-center text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
                >
                  Przejdź do wspólnego Eksploruj →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
