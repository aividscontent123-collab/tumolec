"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { MultiToggleChip } from "@/components/ui/MultiToggleChip";
import { ToggleChip } from "@/components/ui/ToggleChip";
import {
  computeSharedLibrary,
  matchesGenreFilter,
  matchesMultiplayerFilter,
  GENRE_OPTIONS,
  type MultiplayerFilter,
} from "@/lib/steamLibrary";
import { subscribeToParticipants, likeGame, type Participant } from "@/lib/rooms";
import { useParticipant } from "@/lib/useParticipant";
import type { SteamCacheEntry } from "@/lib/steam";
import type { SwipeGame } from "@/lib/types";

const MULTIPLAYER_OPTIONS: { value: MultiplayerFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "solo", label: "Jednoosobowe" },
  { value: "multi", label: "Wieloosobowe" },
];

type DetailsResponse = SteamCacheEntry & { steamAppId: number; error?: string };

function toSwipeGame(data: DetailsResponse): SwipeGame {
  return {
    steamAppId: data.steamAppId,
    title: data.name,
    coverImageUrl: data.headerImageUrl,
    tags: data.tags,
    genres: data.genres,
    reviewScorePercent: data.reviewScorePercent,
    reviewSummary: data.reviewSummary,
    shortDescription: data.shortDescription,
    developers: data.developers,
    releaseDate: data.releaseDate,
    screenshots: data.screenshots,
    trailerHlsUrl: data.trailerHlsUrl,
    trailerThumbnail: data.trailerThumbnail,
    totalReviews: data.totalReviews,
    topReviews: data.topReviews,
  };
}

/** Explore w pokoju: swipe bez eliminacji po części wspólnej bibliotek
 * uczestników. Polubienie zapisuje do rooms/{code}/liked (Task 5), pominięcie
 * po prostu przechodzi dalej -- ten sam wzorzec leniwego fetchowania co
 * SoloSwipeScreen.advance(), tylko źródło appidów to computeSharedLibrary. */
export function RoomExploreScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("multi");
  const [genres, setGenres] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const cursorRef = useRef(0);
  const poolRef = useRef<number[]>([]);

  useEffect(() => subscribeToParticipants(roomCode, setParticipants), [roomCode]);

  const shared = computeSharedLibrary(participants);

  async function advance() {
    setLoadingCard(true);
    while (cursorRef.current < poolRef.current.length) {
      const steamAppId = poolRef.current[cursorRef.current];
      cursorRef.current += 1;
      try {
        const res = await fetch(`/api/steam/details?appid=${steamAppId}`);
        const data = (await res.json()) as DetailsResponse;
        if (!res.ok || data.error) continue;
        if (!matchesMultiplayerFilter(data.tags, multiplayer)) continue;
        if (!matchesGenreFilter(data.genres, genres)) continue;
        setCurrentCard(toSwipeGame({ ...data, steamAppId }));
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

  function handleStart() {
    poolRef.current = shared;
    cursorRef.current = 0;
    setExhausted(false);
    setStarted(true);
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

  if (!started) {
    return (
      <main className="flex h-dvh flex-col px-[22px] pt-[18px] pb-[30px]">
        <div className="flex items-center gap-3">
          <Link
            href={`/room/${roomCode}`}
            aria-label="Wstecz"
            className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
          >
            ‹
          </Link>
          <h1 className="font-heading text-[18px] font-bold text-foreground">Eksploruj</h1>
        </div>

        {shared.length === 0 ? (
          <p className="text-text-secondary mt-6 text-center text-sm">
            Za mało uczestników z podpiętym Steamem, żeby policzyć wspólną bibliotekę.
          </p>
        ) : (
          <>
            <p className="text-text-secondary mt-4 text-sm">Wspólna biblioteka: {shared.length} gier</p>
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Jak chcecie grać?</p>
              <ToggleChip value={multiplayer} options={MULTIPLAYER_OPTIONS} onChange={setMultiplayer} columns={3} />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Jaki gatunek?</p>
              <MultiToggleChip value={genres} options={GENRE_OPTIONS} onChange={setGenres} columns={2} />
            </div>
            <button
              type="button"
              onClick={handleStart}
              className="bg-accent-brand mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
            >
              Zacznij przeglądać
            </button>
          </>
        )}
        <Link
          href={`/room/${roomCode}/liked`}
          className="text-text-secondary mt-4 text-center text-sm underline"
        >
          Zobacz Polubione →
        </Link>
      </main>
    );
  }

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[10px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setStarted(false)}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <Link href={`/room/${roomCode}/liked`} className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground">
          ❤️ Polubione
        </Link>
      </div>

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
