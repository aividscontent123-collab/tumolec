"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { addLiked, getLocalLiked, removeLiked, saveLocalLiked } from "@/lib/localLiked";
import type { SteamCacheEntry } from "@/lib/steam";
import type { SwipeGame } from "@/lib/types";

type SteamSuggestion = { steamAppId: number; name: string; tinyImage: string };
type DetailsResponse = SteamCacheEntry & { steamAppId: number; error?: string };

function toSwipeGame(data: DetailsResponse): SwipeGame {
  return {
    steamAppId: data.steamAppId,
    title: data.name,
    coverImageUrl: data.headerImageUrl,
    tags: data.tags ?? [],
    genres: data.genres ?? [],
    reviewScorePercent: data.reviewScorePercent,
    reviewSummary: data.reviewSummary,
    shortDescription: data.shortDescription,
    developers: data.developers ?? [],
    releaseDate: data.releaseDate,
    screenshots: data.screenshots ?? [],
    trailerHlsUrl: data.trailerHlsUrl,
    trailerThumbnail: data.trailerThumbnail,
    totalReviews: data.totalReviews ?? 0,
    topReviews: data.topReviews ?? [],
    hltbMainStory: data.hltbMainStory ?? null,
  };
}

/** Ekran Polubionych solo -- czyta appidy z localStorage, dociąga pełne dane
 * z steam_cache (przez /api/steam/details, cache-first jak wszędzie indziej),
 * pozwala usunąć i ręcznie dopisać, uruchamia lokalny Versus na wczytanej
 * liście (nie tylko appidach -- unika ponownego fetchowania w LocalVersusScreen). */
export function SoloLikedScreen({
  onBack,
  onStartVersus,
}: {
  onBack: () => void;
  onStartVersus: (games: SwipeGame[]) => void;
}) {
  const [games, setGames] = useState<SwipeGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<SteamSuggestion[]>([]);
  const [adding, setAdding] = useState<number | null>(null);

  async function reload() {
    setLoading(true);
    const ids = getLocalLiked();
    const loaded = await Promise.all(
      ids.map(async (steamAppId) => {
        try {
          const res = await fetch(`/api/steam/details?appid=${steamAppId}`);
          const data = (await res.json()) as DetailsResponse;
          if (!res.ok || data.error) return null;
          return toSwipeGame({ ...data, steamAppId });
        } catch {
          return null;
        }
      }),
    );
    setGames(loaded.filter((g): g is SwipeGame => g !== null));
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRemove(steamAppId: number) {
    saveLocalLiked(removeLiked(getLocalLiked(), steamAppId));
    setGames((gs) => gs.filter((g) => g.steamAppId !== steamAppId));
  }

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (term.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      const res = await fetch(`/api/steam/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      setSuggestions(res.ok ? data.results : []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [term]);

  async function pickGame(suggestion: SteamSuggestion) {
    setAdding(suggestion.steamAppId);
    try {
      const res = await fetch(`/api/steam/details?appid=${suggestion.steamAppId}`);
      const data = (await res.json()) as DetailsResponse;
      if (!res.ok || data.error) return;
      saveLocalLiked(addLiked(getLocalLiked(), suggestion.steamAppId));
      setGames((gs) =>
        gs.some((g) => g.steamAppId === suggestion.steamAppId)
          ? gs
          : [...gs, toSwipeGame({ ...data, steamAppId: suggestion.steamAppId })],
      );
      setTerm("");
      setSuggestions([]);
    } finally {
      setAdding(null);
    }
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Polubione</h1>
      </div>

      <div className="relative">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Dopisz grę ręcznie…"
          className="bg-card border-border w-full rounded-xl border px-4 py-3 text-foreground"
        />
        {suggestions.length > 0 && (
          <div className="bg-popover border-border absolute top-full right-0 left-0 z-10 mt-2 max-h-80 overflow-y-auto rounded-xl border">
            {suggestions.map((s) => (
              <button
                key={s.steamAppId}
                type="button"
                onClick={() => pickGame(s)}
                disabled={adding !== null}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/5 disabled:opacity-50"
              >
                <Image src={s.tinyImage} alt="" width={64} height={32} className="h-8 w-16 rounded object-cover" />
                <span className="text-sm text-foreground">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-text-secondary py-8 text-center text-sm">Wczytuję…</p>
        ) : games.length === 0 ? (
          <p className="text-text-secondary py-8 text-center text-sm">
            Brak polubionych gier — wróć do przeglądania albo dopisz coś ręcznie powyżej.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {games.map((game) => (
              <li key={game.steamAppId} className="bg-card border-border flex items-center gap-3 rounded-xl border p-3">
                {game.coverImageUrl && (
                  <Image src={game.coverImageUrl} alt="" width={96} height={48} className="h-12 w-24 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{game.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(game.steamAppId)}
                  className="bg-secondary text-pass shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                >
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        disabled={games.length < 2}
        onClick={() => onStartVersus(games)}
        className="rounded-full py-3 text-center text-sm font-bold disabled:bg-secondary disabled:text-text-secondary bg-accent-brand text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:shadow-none"
      >
        {games.length >= 2 ? "Rozpocznij Versus →" : "Polub co najmniej 2 gry"}
      </button>
    </main>
  );
}
