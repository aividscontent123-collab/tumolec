"use client";

import { useEffect, useRef, useState } from "react";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import type { SwipeGame } from "@/lib/types";
import { matchesMultiplayerFilter, type MultiplayerFilter, type SteamOwnedGame } from "@/lib/steamLibrary";

type DetailsResponse = {
  steamAppId: number;
  name: string;
  headerImageUrl: string;
  tags: string[];
  reviewScorePercent: number;
  reviewSummary: string;
  error?: string;
};

/** Solo: żadnego zapisu do Firestore, żadnego pokoju -- decyzje żyją tylko
 * w stanie tego komponentu, zgodnie z zachowaniem Dustpile ("Twoje wybory
 * zostają w przeglądarce"). Karty dociągane leniwie: appdetails wołane
 * dopiero dla kolejnego kandydata z `pool`, pomijane jeśli nie pasuje do
 * filtra solo/multi -- nigdy nie pytamy o więcej niż faktycznie pokazujemy. */
export function SoloSwipeScreen({
  pool,
  multiplayerFilter,
  onExit,
}: {
  pool: SteamOwnedGame[];
  multiplayerFilter: MultiplayerFilter;
  onExit: () => void;
}) {
  const cursorRef = useRef(0);
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loadingCard, setLoadingCard] = useState(true);

  async function advance() {
    setLoadingCard(true);
    while (cursorRef.current < pool.length) {
      const candidate = pool[cursorRef.current];
      cursorRef.current += 1;
      try {
        const res = await fetch(`/api/steam/details?appid=${candidate.steamAppId}`);
        const data = (await res.json()) as DetailsResponse;
        if (!res.ok || data.error) continue;
        if (!matchesMultiplayerFilter(data.tags, multiplayerFilter)) continue;
        setCurrentCard({
          steamAppId: data.steamAppId,
          title: data.name,
          coverImageUrl: data.headerImageUrl,
          tags: data.tags,
          reviewScorePercent: data.reviewScorePercent,
          reviewSummary: data.reviewSummary,
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

  function handleSwipe() {
    advance();
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Twoja biblioteka</h1>
      </div>

      <div className="min-h-0 flex-1">
        {loadingCard ? (
          <p className="text-text-secondary p-6 text-center text-sm">Szukam kolejnej gry…</p>
        ) : exhausted ? (
          <p className="text-text-secondary p-6 text-center text-sm">
            To wszystkie gry pasujące do Twoich filtrów.
          </p>
        ) : currentCard ? (
          <SwipeCard key={currentCard.steamAppId} game={currentCard} onSwipe={handleSwipe} />
        ) : null}
      </div>

      {!exhausted && !loadingCard && <SwipeActionButtons onPass={handleSwipe} onLike={handleSwipe} />}
    </main>
  );
}
