"use client";

import { useEffect, useRef, useState } from "react";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { TagFilterBar, NEW_RELEASE_TAG, UPCOMING_TAG } from "@/components/swipe/TagFilterBar";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import type { SwipeGame } from "@/lib/types";
import type { SteamOwnedGame } from "@/lib/steamLibrary";
import { matchesTagOrCommunityFilter, toSwipeGame, type SteamCacheEntry } from "@/lib/steam";
import { isRecentRelease, isUpcomingSoon } from "@/lib/releaseCountdown";
import { addLiked, getLocalLiked, saveLocalLiked } from "@/lib/localLiked";
import { MiniGameLauncher } from "@/components/minigames/MiniGameLauncher";
import { RoomUpgradeButton } from "@/components/solo/RoomUpgradeButton";

type DetailsResponse = SteamCacheEntry & { steamAppId: number; error?: string };

/** Solo: żadnego zapisu do Firestore, żadnego pokoju -- decyzje żyją tylko
 * w stanie tego komponentu, zgodnie z zachowaniem Dustpile ("Twoje wybory
 * zostają w przeglądarce"). Karty dociągane leniwie: appdetails wołane
 * dopiero dla kolejnego kandydata z `pool`, pomijane jeśli nie pasuje do
 * filtra solo/multi -- nigdy nie pytamy o więcej niż faktycznie pokazujemy. */
type SoloSwipeProps =
  | { source: "library"; pool: SteamOwnedGame[]; onExit: () => void; onViewLiked: () => void }
  | { source: "catalog"; excludeAppIds: number[]; onExit: () => void; onViewLiked: () => void };

export function SoloSwipeScreen(props: SoloSwipeProps) {
  const { onExit, onViewLiked } = props;
  const [genreFilter, setGenreFilter] = useState<string[]>([]);
  const cursorRef = useRef(0);
  // tagIds: null = brak danych społecznościowych Steama (biblioteka/wspólna pula
  // nigdy nie przechodzi przez stronę wyników wyszukiwania) -- tylko kandydaci
  // z katalogu mają realną (możliwie pustą) listę, zob. matchesTagOrCommunityFilter.
  const poolRef = useRef<{ appId: number; tagIds: number[] | null }[]>(
    props.source === "library" ? props.pool.map((g) => ({ appId: g.steamAppId, tagIds: null })) : [],
  );
  const discoverStartRef = useRef(0);
  const discoverExhaustedRef = useRef(props.source === "library");
  const excludeSetRef = useRef(new Set<number>(props.source === "catalog" ? props.excludeAppIds : []));
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loadingCard, setLoadingCard] = useState(true);

  async function fetchNextDiscoverPage() {
    const genresParam = genreFilter.join(",");
    // discoverStartRef.current === 0 signals a fresh browsing session (mount,
    // or the genre-filter-reset effect below) -- randomize only that first
    // fetch, subsequent pages continue sequentially from the real start Steam
    // returned.
    const randomParam = discoverStartRef.current === 0 ? "&random=1" : "";
    const res = await fetch(
      `/api/steam/discover?genres=${encodeURIComponent(genresParam)}&start=${discoverStartRef.current}${randomParam}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as { results: { appId: number; tagIds: number[] }[]; hasMore: boolean; start: number };
  }

  async function advance() {
    setLoadingCard(true);
    while (true) {
      if (cursorRef.current >= poolRef.current.length) {
        if (discoverExhaustedRef.current) break;
        let page: { results: { appId: number; tagIds: number[] }[]; hasMore: boolean; start: number } | null;
        try {
          page = await fetchNextDiscoverPage();
        } catch {
          page = null;
        }
        if (!page) {
          discoverExhaustedRef.current = true;
          break;
        }
        if (page.results.length === 0) {
          discoverExhaustedRef.current = true;
          break;
        }
        discoverStartRef.current = page.start + page.results.length;
        if (!page.hasMore) discoverExhaustedRef.current = true;
        const fresh = page.results.filter((r) => !excludeSetRef.current.has(r.appId));
        poolRef.current.push(...fresh);
        continue;
      }
      const candidate = poolRef.current[cursorRef.current];
      cursorRef.current += 1;
      try {
        const res = await fetch(`/api/steam/details?appid=${candidate.appId}`);
        const data = (await res.json()) as DetailsResponse;
        if (!res.ok || data.error) continue;
        // Wpisy steam_cache sprzed dodania danego pola (tags, topReviews...)
        // nie mają go wcale -- normalizacja od razu, przed filtrami, żeby nie
        // wywaliły się na undefined (toSwipeGame normalizuje resztę pól samo).
        const tags = data.tags ?? [];
        const realTags = genreFilter.filter((v) => v !== NEW_RELEASE_TAG && v !== UPCOMING_TAG);
        if (!matchesTagOrCommunityFilter(tags, candidate.tagIds, realTags)) continue;
        const wantsNew = genreFilter.includes(NEW_RELEASE_TAG);
        const wantsSoon = genreFilter.includes(UPCOMING_TAG);
        if (wantsNew || wantsSoon) {
          const matchesDate =
            (wantsNew && isRecentRelease(data.releaseDate)) || (wantsSoon && isUpcomingSoon(data.releaseDate));
          if (!matchesDate) continue;
        } else if (data.releaseDate?.comingSoon) {
          // Domyślne przeglądanie (bez wybranego Nowości/Wkrótce) nie ma
          // pokazywać niewydanych jeszcze tytułów -- to opt-in przez te
          // pigułki, nie coś co ma wpadać przypadkiem.
          continue;
        }
        excludeSetRef.current.add(candidate.appId);
        setCurrentCard(toSwipeGame(data.steamAppId, data));
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
      </div>

      <TagFilterBar value={genreFilter} onChange={setGenreFilter} />

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
      {props.source === "library" ? (
        <RoomUpgradeButton source="library" libraryAppIds={props.pool.map((g) => g.steamAppId)} genreFilter={genreFilter} />
      ) : (
        <RoomUpgradeButton source="catalog" genreFilter={genreFilter} />
      )}
    </main>
  );
}
