"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { MultiToggleChip } from "@/components/ui/MultiToggleChip";
import { roomExists, createRoom, joinRoom } from "@/lib/rooms";
import { GENRE_OPTIONS, type BacklogFilter, type MultiplayerFilter } from "@/lib/steamLibrary";

const BACKLOG_OPTIONS: { value: BacklogFilter; label: string }[] = [
  { value: "never", label: "Nigdy nie grane (0 min)" },
  { value: "under2h", label: "Mniej niż 2 godziny gry" },
  { value: "under10h", label: "Mniej niż 10 godzin gry" },
  { value: "abandoned", label: "Porzucone (2-10 h)" },
];

const MULTIPLAYER_OPTIONS: { value: MultiplayerFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "solo", label: "Jednoosobowe" },
  { value: "multi", label: "Wieloosobowe" },
];

export function SoloSettingsScreen({
  onLoadLibrary,
  loading,
  error,
}: {
  onLoadLibrary: (profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter, genres: string[]) => void;
  loading: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState("");
  const [backlog, setBacklog] = useState<BacklogFilter>("never");
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("all");
  const [genres, setGenres] = useState<string[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createNickname, setCreateNickname] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setJoinError(null);
    try {
      if (!(await roomExists(code))) {
        setJoinError(`Nie znaleziono pokoju o kodzie ${code}.`);
        setJoining(false);
        return;
      }
      router.push(`/room/${code}`);
    } catch {
      setJoinError("Nie udało się sprawdzić kodu pokoju. Spróbuj ponownie.");
      setJoining(false);
    }
  }

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    const nickname = createNickname.trim();
    if (!nickname) return;
    setCreating(true);
    setCreateError(null);
    try {
      const code = await createRoom("Wieczór gier");
      const id = crypto.randomUUID();
      await joinRoom(code, id, nickname);
      localStorage.setItem(`tumolec:${code}:participantId`, id);
      localStorage.setItem(`tumolec:${code}:nickname`, nickname);
      router.push(`/room/${code}`);
    } catch {
      setCreateError("Nie udało się utworzyć pokoju. Spróbuj ponownie.");
      setCreating(false);
    }
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col items-center justify-center px-[22px]">
      <div className="w-full max-w-sm">
        <h1 className="font-heading mb-1 text-center text-[30px] font-bold text-foreground">
          Tumolec
        </h1>
        <p className="text-text-secondary mb-6 text-center text-sm">
          Przeglądaj gry kurzące się w twojej bibliotece: w prawo znaczy „zagram", w lewo „pomiń".
        </p>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">Twój profil Steam</span>
          <input
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="https://steamcommunity.com/id/..."
            className="bg-card border-border rounded-xl border px-4 py-3 text-foreground"
          />
          <p className="text-text-secondary text-xs">
            Wklej link do profilu (steamcommunity.com/id/... lub /profiles/...) albo własną nazwę URL.
          </p>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-foreground">Które gry pokazywać?</p>
          <ToggleChip value={backlog} options={BACKLOG_OPTIONS} onChange={setBacklog} columns={2} />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-foreground">Jak chcesz grać?</p>
          <ToggleChip value={multiplayer} options={MULTIPLAYER_OPTIONS} onChange={setMultiplayer} columns={3} />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-foreground">Jaki gatunek?</p>
          <MultiToggleChip value={genres} options={GENRE_OPTIONS} onChange={setGenres} columns={2} />
        </div>

        {error && <p className="text-pass mt-4 text-sm">{error}</p>}

        <button
          type="button"
          disabled={loading || !profile.trim()}
          onClick={() => onLoadLibrary(profile.trim(), backlog, multiplayer, genres)}
          className="bg-accent-brand mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
        >
          {loading ? "Wczytuję…" : "Wczytaj bibliotekę"}
        </button>

        <div className="mt-6 flex flex-col items-center gap-2">
          <Link href="/packages" className="text-text-secondary text-center text-sm underline">
            Zapisane paczki gier
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="text-text-secondary text-center text-sm underline"
          >
            Stwórz pokój dla znajomych
          </button>
          {showCreate && (
            <form onSubmit={handleCreateRoom} className="mt-2 flex w-full gap-2">
              <input
                value={createNickname}
                onChange={(e) => setCreateNickname(e.target.value)}
                placeholder="Twój pseudonim"
                maxLength={24}
                className="bg-card border-border flex-1 rounded-xl border px-4 py-3 text-foreground"
              />
              <button
                type="submit"
                disabled={creating}
                className="bg-accent-brand rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                Stwórz
              </button>
            </form>
          )}
          {createError && <p className="text-pass text-sm">{createError}</p>}
          <button
            type="button"
            onClick={() => setShowJoin((v) => !v)}
            className="text-text-secondary text-center text-sm underline"
          >
            Mam kod pokoju od znajomego
          </button>
          {showJoin && (
            <form onSubmit={handleJoinByCode} className="mt-2 flex w-full gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="np. K7M2QP"
                className="bg-card border-border flex-1 rounded-xl border px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-foreground uppercase"
              />
              <button
                type="submit"
                disabled={joining}
                className="bg-secondary rounded-xl px-4 py-3 text-sm font-bold text-foreground disabled:opacity-50"
              >
                Dołącz
              </button>
            </form>
          )}
          {joinError && <p className="text-pass text-sm">{joinError}</p>}
        </div>
      </div>
    </main>
  );
}
