"use client";

import { useState } from "react";
import { LocalVersusScreen } from "@/components/solo/LocalVersusScreen";
import { SoloLikedScreen } from "@/components/solo/SoloLikedScreen";
import { SoloSettingsScreen } from "@/components/solo/SoloSettingsScreen";
import { SoloSwipeScreen } from "@/components/solo/SoloSwipeScreen";
import type { SwipeGame } from "@/lib/types";
import {
  filterByPlaytime,
  shuffleGames,
  type BacklogFilter,
  type MultiplayerFilter,
  type SteamOwnedGame,
} from "@/lib/steamLibrary";

type Screen =
  | { name: "settings" }
  | { name: "swipe"; pool: SteamOwnedGame[]; multiplayer: MultiplayerFilter }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };

export function SoloHome() {
  const [screen, setScreen] = useState<Screen>({ name: "settings" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadLibrary(profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/steam/library?profile=${encodeURIComponent(profile)}`);
      const data = (await res.json()) as { games?: SteamOwnedGame[]; error?: string };
      if (!res.ok || !data.games) {
        setError(data.error ?? "Nie udało się wczytać biblioteki.");
        setLoading(false);
        return;
      }
      const filtered = filterByPlaytime(data.games, backlog);
      if (filtered.length === 0) {
        setError("Brak gier pasujących do tego filtra.");
        setLoading(false);
        return;
      }
      setScreen({ name: "swipe", pool: shuffleGames(filtered), multiplayer });
      setLoading(false);
    } catch {
      setError("Coś poszło nie tak. Spróbuj ponownie.");
      setLoading(false);
    }
  }

  if (screen.name === "swipe") {
    return (
      <SoloSwipeScreen
        pool={screen.pool}
        multiplayerFilter={screen.multiplayer}
        onExit={() => setScreen({ name: "settings" })}
        onViewLiked={() => setScreen({ name: "liked" })}
      />
    );
  }

  if (screen.name === "versus") {
    return <LocalVersusScreen games={screen.games} onExit={() => setScreen({ name: "liked" })} />;
  }

  if (screen.name === "liked") {
    return (
      <SoloLikedScreen
        onBack={() => setScreen({ name: "settings" })}
        onStartVersus={(games) => setScreen({ name: "versus", games })}
      />
    );
  }

  return <SoloSettingsScreen onLoadLibrary={handleLoadLibrary} loading={loading} error={error} />;
}
