"use client";

import { useState } from "react";
import { LocalVersusScreen } from "@/components/solo/LocalVersusScreen";
import { SoloLikedScreen } from "@/components/solo/SoloLikedScreen";
import { SoloSettingsScreen } from "@/components/solo/SoloSettingsScreen";
import { SoloStatsScreen } from "@/components/solo/SoloStatsScreen";
import { SoloSwipeScreen } from "@/components/solo/SoloSwipeScreen";
import type { SwipeGame } from "@/lib/types";
import {
  filterByPlaytime,
  shuffleGames,
  type BacklogFilter,
  type SteamOwnedGame,
} from "@/lib/steamLibrary";

type Screen =
  | { name: "settings" }
  | { name: "stats" }
  | { name: "swipe"; source: "library"; pool: SteamOwnedGame[] }
  | { name: "swipe"; source: "catalog"; excludeAppIds: number[] }
  | { name: "liked" }
  | { name: "versus"; games: SwipeGame[] };

export function SoloHome() {
  const [screen, setScreen] = useState<Screen>({ name: "settings" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadLibrary(source: "library" | "catalog", profile: string, backlog: BacklogFilter) {
    setLoading(true);
    setError(null);
    try {
      if (!profile) {
        // Katalog bez profilu -- nic do wykluczenia, prosto do Explore.
        setScreen({ name: "swipe", source: "catalog", excludeAppIds: [] });
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/steam/library?profile=${encodeURIComponent(profile)}`);
      const data = (await res.json()) as { games?: SteamOwnedGame[]; error?: string };
      if (!res.ok || !data.games) {
        setError(data.error ?? "Nie udało się wczytać biblioteki.");
        setLoading(false);
        return;
      }

      if (source === "catalog") {
        setScreen({ name: "swipe", source: "catalog", excludeAppIds: data.games.map((g) => g.steamAppId) });
        setLoading(false);
        return;
      }

      const filtered = filterByPlaytime(data.games, backlog);
      if (filtered.length === 0) {
        setError("Brak gier pasujących do tego filtra.");
        setLoading(false);
        return;
      }
      setScreen({ name: "swipe", source: "library", pool: shuffleGames(filtered) });
      setLoading(false);
    } catch {
      setError("Coś poszło nie tak. Spróbuj ponownie.");
      setLoading(false);
    }
  }

  if (screen.name === "swipe" && screen.source === "library") {
    return (
      <SoloSwipeScreen
        source="library"
        pool={screen.pool}
        onExit={() => setScreen({ name: "settings" })}
        onViewLiked={() => setScreen({ name: "liked" })}
      />
    );
  }

  if (screen.name === "swipe" && screen.source === "catalog") {
    return (
      <SoloSwipeScreen
        source="catalog"
        excludeAppIds={screen.excludeAppIds}
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

  if (screen.name === "stats") {
    return <SoloStatsScreen onBack={() => setScreen({ name: "settings" })} />;
  }

  return (
    <SoloSettingsScreen
      onLoadLibrary={handleLoadLibrary}
      loading={loading}
      error={error}
      onViewStats={() => setScreen({ name: "stats" })}
    />
  );
}
