"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom, roomExists } from "@/lib/rooms";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [roomName, setRoomName] = useState("Wieczór ekipy");
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) {
      setError("Podaj pseudonim.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const participantId = crypto.randomUUID();
      const code =
        mode === "create"
          ? await createRoom(roomName.trim() || "Wieczór ekipy")
          : roomCode.trim().toUpperCase();

      if (mode === "join" && !(await roomExists(code))) {
        setError(`Nie znaleziono pokoju o kodzie ${code}.`);
        setBusy(false);
        return;
      }

      await joinRoom(code, participantId, nickname.trim());
      localStorage.setItem(`tumolec:${code}:participantId`, participantId);
      localStorage.setItem(`tumolec:${code}:nickname`, nickname.trim());
      router.push(`/room/${code}`);
    } catch {
      setError("Coś poszło nie tak. Spróbuj ponownie.");
      setBusy(false);
    }
  }

  return (
    <main className="flex h-dvh flex-col items-center justify-center px-[22px]">
      <div className="w-full max-w-sm">
        <h1 className="font-heading mb-1 text-center text-[30px] font-bold text-foreground">
          Tumolec
        </h1>
        <p className="text-text-secondary mb-8 text-center text-sm">
          Wybierzcie grę na wieczór — razem, przez swipe.
        </p>

        <div
          className="mb-6 flex rounded-full p-1"
          style={{ backgroundColor: "oklch(0.2 0.02 265)" }}
        >
          {(["create", "join"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="flex-1 rounded-full py-2 text-sm font-semibold transition-colors"
              style={
                mode === m
                  ? { backgroundColor: "var(--accent-brand)", color: "white" }
                  : { color: "var(--text-secondary)" }
              }
            >
              {m === "create" ? "Stwórz pokój" : "Dołącz do pokoju"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "create" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-foreground">Nazwa pokoju</span>
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                maxLength={60}
                className="rounded-xl border px-4 py-3 text-foreground"
                style={{ backgroundColor: "oklch(0.2 0.02 265)", borderColor: "oklch(0.3 0.02 265)" }}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-foreground">Kod pokoju</span>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="np. K7M2QP"
                className="rounded-xl border px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-foreground uppercase"
                style={{ backgroundColor: "oklch(0.2 0.02 265)", borderColor: "oklch(0.3 0.02 265)" }}
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-foreground">Twój pseudonim</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
              className="rounded-xl border px-4 py-3 text-foreground"
              style={{ backgroundColor: "oklch(0.2 0.02 265)", borderColor: "oklch(0.3 0.02 265)" }}
            />
          </label>

          {error && <p style={{ color: "var(--pass)" }} className="text-sm">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-full py-3 text-sm font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--accent-brand)", boxShadow: "0 8px 24px var(--accent-brand-soft)" }}
          >
            {busy ? "Chwila…" : mode === "create" ? "Stwórz pokój" : "Dołącz"}
          </button>
        </form>
      </div>
    </main>
  );
}
