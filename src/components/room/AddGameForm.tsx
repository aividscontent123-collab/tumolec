"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { addGameToPool } from "@/lib/rooms";

type SteamSuggestion = { steamAppId: number; name: string; tinyImage: string };

export function AddGameForm({
  roomCode,
  participantId,
  addFn = addGameToPool,
}: {
  roomCode: string;
  participantId: string;
  addFn?: (roomCode: string, steamAppId: number, participantId: string) => Promise<void>;
}) {
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<SteamSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (term.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/steam/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        setSuggestions(res.ok ? data.results : []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [term]);

  async function pickGame(suggestion: SteamSuggestion) {
    setAdding(suggestion.steamAppId);
    setError(null);
    try {
      const res = await fetch(`/api/steam/details?appid=${suggestion.steamAppId}`);
      if (!res.ok) throw new Error();
      await addFn(roomCode, suggestion.steamAppId, participantId);
      setTerm("");
      setSuggestions([]);
    } catch {
      setError("Nie udało się dodać gry. Spróbuj ponownie.");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="relative">
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Wpisz tytuł gry…"
        className="bg-card border-border w-full rounded-xl border px-4 py-3 text-foreground"
      />

      {(suggestions.length > 0 || loading) && (
        <div className="bg-popover border-border absolute top-full right-0 left-0 z-10 mt-2 max-h-80 overflow-y-auto rounded-xl border">
          {loading && <p className="text-text-secondary p-3 text-sm">Szukam…</p>}
          {suggestions.map((s) => (
            <button
              key={s.steamAppId}
              type="button"
              onClick={() => pickGame(s)}
              disabled={adding !== null}
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/5 disabled:opacity-50"
            >
              <Image
                src={s.tinyImage}
                alt=""
                width={64}
                height={32}
                className="h-8 w-16 rounded object-cover"
              />
              <span className="text-sm text-foreground">
                {s.name} {adding === s.steamAppId && "…"}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-pass mt-2 text-sm">{error}</p>}
    </div>
  );
}
