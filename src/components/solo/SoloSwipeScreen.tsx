"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { GenreFilterBar } from "@/components/swipe/GenreFilterBar";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import type { SwipeGame } from "@/lib/types";
import { matchesTagFilter, matchesMultiplayerFilter, type MultiplayerFilter, type SteamOwnedGame } from "@/lib/steamLibrary";
import { addLiked, getLocalLiked, saveLocalLiked } from "@/lib/localLiked";
import { createRoom, joinRoom, hydrateAndAddGamesToPool } from "@/lib/rooms";
import { MiniGameLauncher } from "@/components/minigames/MiniGameLauncher";

type DetailsResponse = {
  steamAppId: number;
  name: string;
  headerImageUrl: string;
  tags: string[];
  genres: string[];
  reviewScorePercent: number;
  reviewSummary: string;
  shortDescription: string;
  developers: string[];
  releaseDate: { comingSoon: boolean; date: string } | null;
  screenshots: string[];
  trailerHlsUrl: string | null;
  trailerThumbnail: string | null;
  totalReviews: number;
  topReviews: { author: string; text: string; votedUp: boolean }[];
  error?: string;
};

/** Solo: żadnego zapisu do Firestore, żadnego pokoju -- decyzje żyją tylko
 * w stanie tego komponentu, zgodnie z zachowaniem Dustpile ("Twoje wybory
 * zostają w przeglądarce"). Karty dociągane leniwie: appdetails wołane
 * dopiero dla kolejnego kandydata z `pool`, pomijane jeśli nie pasuje do
 * filtra solo/multi -- nigdy nie pytamy o więcej niż faktycznie pokazujemy. */
type SoloSwipeProps =
  | { source: "library"; pool: SteamOwnedGame[]; multiplayerFilter: MultiplayerFilter; onExit: () => void; onViewLiked: () => void }
  | { source: "catalog"; excludeAppIds: number[]; multiplayerFilter: MultiplayerFilter; onExit: () => void; onViewLiked: () => void };

export function SoloSwipeScreen(props: SoloSwipeProps) {
  const { multiplayerFilter, onExit, onViewLiked } = props;
  const router = useRouter();
  const [genreFilter, setGenreFilter] = useState<string[]>([]);
  const cursorRef = useRef(0);
  const poolRef = useRef<number[]>(props.source === "library" ? props.pool.map((g) => g.steamAppId) : []);
  const discoverStartRef = useRef(0);
  const discoverExhaustedRef = useRef(props.source === "library");
  const excludeSetRef = useRef(new Set<number>(props.source === "catalog" ? props.excludeAppIds : []));
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loadingCard, setLoadingCard] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeNickname, setUpgradeNickname] = useState("");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  async function fetchNextDiscoverPage() {
    const genresParam = genreFilter.join(",");
    const res = await fetch(`/api/steam/discover?genres=${encodeURIComponent(genresParam)}&start=${discoverStartRef.current}`);
    if (!res.ok) return null;
    return (await res.json()) as { appIds: number[]; hasMore: boolean };
  }

  async function advance() {
    setLoadingCard(true);
    while (true) {
      if (cursorRef.current >= poolRef.current.length) {
        if (discoverExhaustedRef.current) break;
        let page: { appIds: number[]; hasMore: boolean } | null;
        try {
          page = await fetchNextDiscoverPage();
        } catch {
          page = null;
        }
        if (!page) {
          discoverExhaustedRef.current = true;
          break;
        }
        if (page.appIds.length === 0) {
          discoverExhaustedRef.current = true;
          break;
        }
        discoverStartRef.current += page.appIds.length;
        if (!page.hasMore) discoverExhaustedRef.current = true;
        const fresh = page.appIds.filter((id) => !excludeSetRef.current.has(id));
        poolRef.current.push(...fresh);
        continue;
      }
      const candidate = poolRef.current[cursorRef.current];
      cursorRef.current += 1;
      try {
        const res = await fetch(`/api/steam/details?appid=${candidate}`);
        const data = (await res.json()) as DetailsResponse;
        if (!res.ok || data.error) continue;
        // Wpisy steam_cache sprzed dodania danego pola (genres, topReviews...)
        // nie mają go wcale -- normalizacja od razu, przed filtrami i przed
        // budową karty, żeby żadne z dwóch miejsc nie wywaliło się na undefined.
        const tags = data.tags ?? [];
        const genres = data.genres ?? [];
        if (!matchesMultiplayerFilter(tags, multiplayerFilter)) continue;
        if (!matchesTagFilter(genres, genreFilter)) continue;
        setCurrentCard({
          steamAppId: data.steamAppId,
          title: data.name,
          coverImageUrl: data.headerImageUrl,
          tags,
          genres,
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
        });
        setLoadingCard(false);
        return;
      } catch {
        continue;
      }
    }
    setCurrentCard(null);
    setExhausted(true);
    setLoadingCard(false);
  }

  useEffect(() => {
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Steamowy `start` jest liczony względem konkretnego zapytania z tagami --
  // po zmianie filtra gatunku w trakcie przeglądania katalogu trzeba
  // zresetować paginację, inaczej kolejna strona to "50. najlepszy RPG"
  // zamiast najlepszych dopasowań. Nie dotyka currentCard -- karta na ekranie
  // zostaje, zmienia się tylko to, co dociągnie następny advance().
  useEffect(() => {
    if (props.source !== "catalog") return;
    discoverStartRef.current = 0;
    discoverExhaustedRef.current = false;
    poolRef.current = [];
    cursorRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreFilter]);

  function handleLike() {
    if (currentCard) saveLocalLiked(addLiked(getLocalLiked(), currentCard.steamAppId));
    advance();
  }

  function handlePass() {
    advance();
  }

  async function handleUpgradeToCoop(e: React.FormEvent) {
    e.preventDefault();
    const nickname = upgradeNickname.trim();
    if (!nickname) return;
    setUpgrading(true);
    setUpgradeError(null);
    try {
      if (props.source !== "library") return;
      const appIds = props.pool.map((g) => g.steamAppId);
      const code = await createRoom("Wieczór gier");
      const id = crypto.randomUUID();
      await joinRoom(code, id, nickname, appIds);
      localStorage.setItem(`tumolec:${code}:participantId`, id);
      localStorage.setItem(`tumolec:${code}:nickname`, nickname);
      await hydrateAndAddGamesToPool(code, appIds, id);
      router.push(`/room/${code}`);
    } catch {
      setUpgradeError("Nie udało się utworzyć pokoju. Spróbuj ponownie.");
      setUpgrading(false);
    }
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3 pr-12">
        <button
          type="button"
          onClick={onExit}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <h1 className="font-heading text-[18px] font-bold text-foreground">
          {props.source === "library" ? "Twoja biblioteka" : "Cały katalog Steam"}
        </h1>
        <button
          type="button"
          onClick={onViewLiked}
          className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground"
        >
          ❤️ {getLocalLiked().length}
        </button>
        {props.source === "library" && (
          <button
            type="button"
            onClick={() => setShowUpgrade((v) => !v)}
            className="bg-secondary rounded-full px-4 py-2 text-xs font-bold text-foreground"
          >
            Co-op / Dodaj znajomego
          </button>
        )}
      </div>

      {props.source === "library" && showUpgrade && (
        <form onSubmit={handleUpgradeToCoop} className="bg-card border-border flex gap-2 rounded-xl border p-3">
          <input
            value={upgradeNickname}
            onChange={(e) => setUpgradeNickname(e.target.value)}
            placeholder="Twój pseudonim"
            maxLength={24}
            className="border-border flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={upgrading}
            className="bg-accent-brand rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {upgrading ? "Tworzę…" : "Stwórz"}
          </button>
        </form>
      )}
      {upgradeError && <p className="text-pass text-sm">{upgradeError}</p>}

      <GenreFilterBar value={genreFilter} onChange={setGenreFilter} />

      <div className="min-h-0 flex-1 lg:flex lg:flex-col lg:justify-center">
        {loadingCard ? (
          <p className="text-text-secondary p-6 text-center text-sm">Szukam kolejnej gry…</p>
        ) : exhausted ? (
          <p className="text-text-secondary p-6 text-center text-sm">
            To wszystkie gry pasujące do Twoich filtrów.
          </p>
        ) : currentCard ? (
          <GameDetailLayout key={currentCard.steamAppId} game={currentCard}>
            <SwipeCard
              key={currentCard.steamAppId}
              game={currentCard}
              onSwipe={(direction) => (direction === "right" ? handleLike() : handlePass())}
            />
          </GameDetailLayout>
        ) : null}
      </div>

      {!exhausted && !loadingCard && <SwipeActionButtons onPass={handlePass} onLike={handleLike} />}
      <MiniGameLauncher mode={{ kind: "solo" }} />
    </main>
  );
}
