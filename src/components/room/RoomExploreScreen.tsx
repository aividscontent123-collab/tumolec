"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { ParticipantAvatarRow } from "@/components/ui/ParticipantAvatarRow";
import { VersusStartBanner } from "@/components/ui/VersusStartBanner";
import { SharedLibrarySection } from "@/components/room/SharedLibrarySection";
import { TagFilterBar, NEW_RELEASE_TAG, UPCOMING_TAG } from "@/components/swipe/TagFilterBar";
import { computeSharedLibrary } from "@/lib/steamLibrary";
import { matchesTagOrCommunityFilter, toSwipeGame } from "@/lib/steam";
import { isRecentRelease, isUpcomingSoon } from "@/lib/releaseCountdown";
import {
  subscribeToParticipants,
  likeGame,
  setExploreGenreFilter,
  subscribeToExploreGenreFilter,
  subscribeToLiked,
  type Participant,
} from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import type { SteamCacheEntry } from "@/lib/steam";
import type { SwipeGame } from "@/lib/types";

type DetailsResponse = SteamCacheEntry & { steamAppId: number; error?: string };

/** Explore w pokoju: swipe bez eliminacji po części wspólnej bibliotek
 * uczestników. Polubienie zapisuje do rooms/{code}/liked (Task 5), pominięcie
 * po prostu przechodzi dalej -- ten sam wzorzec leniwego fetchowania co
 * SoloSwipeScreen.advance(), tylko źródło appidów to computeSharedLibrary.
 *
 * Bez osobnego ekranu wyboru źródła/trybu gry przed startem -- przeglądanie
 * zaczyna się od razu po dołączeniu (domyślnie cały katalog), solo/multi
 * i gatunek są już pigułkami w TagFilterBar. Przełączenie na wspólną
 * bibliotekę w trakcie robi się przez rozszerzony panel "🤝 Porównaj"
 * (restartuje talię od tego źródła, nie przerywa właśnie oglądanej karty
 * w połowie -- handleStart i tak czyści cały stan pobierania). */
export function RoomExploreScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [source, setSource] = useState<"shared" | "catalog">("catalog");
  const [likedCount, setLikedCount] = useState(0);
  const [showSharedLibrary, setShowSharedLibrary] = useState(false);
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [loadingCard, setLoadingCard] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const cursorRef = useRef(0);
  // tagIds: null = brak danych społecznościowych Steama (wspólna biblioteka
  // nigdy nie przechodzi przez stronę wyników wyszukiwania) -- tylko kandydaci
  // z katalogu mają realną (możliwie pustą) listę, zob. matchesTagOrCommunityFilter.
  const poolRef = useRef<{ appId: number; tagIds: number[] | null }[]>([]);
  const discoverStartRef = useRef(0);
  const discoverExhaustedRef = useRef(false);
  const excludeSetRef = useRef<Set<number>>(new Set());
  const searchParams = useSearchParams();
  const startedRef = useRef(false);

  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);
  // Filtr gatunku żyje w rooms/{roomCode}/session/state -- każdy gracz
  // subskrybuje na żywo i może pisać, zob. Task 2 (rooms.ts).
  useEffect(() => subscribeToExploreGenreFilter(roomCode, setGenres), [roomCode]);
  useEffect(() => subscribeToLiked(roomCode, (games) => setLikedCount(games.length)), [roomCode]);

  // Steamowy `start` jest liczony względem konkretnego zapytania z tagami --
  // po zmianie filtra gatunku w trakcie przeglądania katalogu trzeba
  // zresetować paginację, inaczej kolejna strona to "50. najlepszy RPG"
  // zamiast najlepszych dopasowań. Nie dotyka currentCard -- karta na ekranie
  // zostaje, zmienia się tylko to, co dociągnie następny advance().
  useEffect(() => {
    if (!startedRef.current || source !== "catalog") return;
    discoverStartRef.current = 0;
    discoverExhaustedRef.current = false;
    poolRef.current = [];
    cursorRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genres]);

  // Przeglądanie zaczyna się od razu, bez ekranu wyboru -- domyślnie cały
  // katalog. RoomUpgradeButton (upgrade solo->pokój) może wskazać `?source=shared`
  // w linku, żeby wylądować od razu we wspólnej bibliotece zamiast katalogu;
  // dla "shared" czekamy aż subscribeToParticipants dostarczy przynajmniej
  // naszego własnego uczestnika, inaczej `shared` policzyłoby się z pustej listy.
  useEffect(() => {
    if (startedRef.current || !participantId) return;
    const requestedSource = searchParams.get("source");
    const initialSource: "shared" | "catalog" = requestedSource === "shared" ? "shared" : "catalog";
    if (initialSource === "shared" && participants.length === 0) return;
    startedRef.current = true;
    handleStart(initialSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, participants]);

  function handleGenreChange(next: string[]) {
    setGenres(next);
    setExploreGenreFilter(roomCode, next);
  }

  const shared = computeSharedLibrary(participants);

  async function fetchNextDiscoverPage() {
    const genresParam = genres.join(",");
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
        // Wpisy steam_cache sprzed dodania danego pola (genres, topReviews...)
        // nie mają go wcale -- filtry muszą dostać znormalizowane tablice,
        // nie surowe (potencjalnie undefined) pole z odpowiedzi API. Filtr
        // solo/multi to już pigułki Jednoosobowa/Kooperacja/Wieloosobowa w
        // TagFilterBar (genres), nie osobny mechanizm -- matchesTagOrCommunityFilter
        // niżej go pokrywa tak samo jak każdy inny tag.
        const realTags = genres.filter((v) => v !== NEW_RELEASE_TAG && v !== UPCOMING_TAG);
        if (!matchesTagOrCommunityFilter(data.tags ?? [], candidate.tagIds, realTags)) continue;
        const wantsNew = genres.includes(NEW_RELEASE_TAG);
        const wantsSoon = genres.includes(UPCOMING_TAG);
        if (wantsNew || wantsSoon) {
          const matchesDate =
            (wantsNew && isRecentRelease(data.releaseDate)) || (wantsSoon && isUpcomingSoon(data.releaseDate));
          if (!matchesDate) continue;
        } else if (data.releaseDate?.comingSoon) {
          continue;
        }
        excludeSetRef.current.add(candidate.appId);
        setCurrentCard(toSwipeGame(candidate.appId, data));
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

  function handleStart(startSource: "shared" | "catalog" = source) {
    cursorRef.current = 0;
    discoverStartRef.current = 0;
    discoverExhaustedRef.current = startSource !== "catalog";
    if (startSource === "shared") {
      poolRef.current = shared.map((appId) => ({ appId, tagIds: null }));
    } else {
      poolRef.current = [];
      const me = participants.find((p) => p.participantId === participantId);
      excludeSetRef.current = new Set(me?.steamLibraryAppIds ?? []);
    }
    setSource(startSource);
    setExhausted(false);
    advance();
  }

  function handleLike() {
    if (currentCard && participantId) likeGame(roomCode, currentCard.steamAppId, participantId);
    advance();
  }

  function handlePass() {
    advance();
  }

  if (!participantId) {
    return (
      <p className="text-text-secondary p-6 text-center text-sm">
        Wróć do <Link href={`/room/${roomCode}`} className="underline">lobby</Link>, żeby dołączyć do pokoju.
      </p>
    );
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3 pr-12">
        <Link
          href={`/room/${roomCode}`}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </Link>
        <ParticipantAvatarRow participants={participants} />
        <button
          type="button"
          onClick={() => setShowSharedLibrary((v) => !v)}
          aria-pressed={showSharedLibrary}
          className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground"
        >
          🤝 Porównaj
        </button>
        <Link href={`/room/${roomCode}/liked`} className="bg-secondary rounded-full px-4 py-2 text-xs font-bold text-foreground">
          ❤️ {likedCount}
        </Link>
      </div>

      <VersusStartBanner roomCode={roomCode} participantId={participantId} participants={participants} />

      {showSharedLibrary && participantId && (
        <div className="flex flex-col gap-2">
          {source === "catalog" && shared.length > 0 && (
            <button
              type="button"
              onClick={() => {
                handleStart("shared");
                setShowSharedLibrary(false);
              }}
              className="bg-secondary rounded-full px-4 py-2 text-center text-xs font-bold text-foreground"
            >
              Przeglądaj tylko wspólne gry ({shared.length})
            </button>
          )}
          {source === "shared" && (
            <button
              type="button"
              onClick={() => {
                handleStart("catalog");
                setShowSharedLibrary(false);
              }}
              className="bg-secondary rounded-full px-4 py-2 text-center text-xs font-bold text-foreground"
            >
              Wróć do całego katalogu
            </button>
          )}
          <SharedLibrarySection
            roomCode={roomCode}
            participantId={participantId}
            participants={participants}
            showEmptyMessage
          />
        </div>
      )}

      <TagFilterBar value={genres} onChange={handleGenreChange} />

      <div className="min-h-0 flex-1 lg:flex lg:flex-col lg:justify-center">
        {loadingCard ? (
          <p className="text-text-secondary p-6 text-center text-sm">Szukam kolejnej gry…</p>
        ) : exhausted ? (
          <p className="text-text-secondary p-6 text-center text-sm">To wszystkie gry pasujące do filtrów.</p>
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
    </main>
  );
}
