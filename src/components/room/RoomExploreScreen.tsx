"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { TagFilterBar, NEW_RELEASE_TAG, UPCOMING_TAG } from "@/components/swipe/TagFilterBar";
import {
  computeSharedLibrary,
  matchesMultiplayerFilter,
  type MultiplayerFilter,
} from "@/lib/steamLibrary";
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

const MULTIPLAYER_OPTIONS: { value: MultiplayerFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "solo", label: "Jednoosobowe" },
  { value: "multi", label: "Wieloosobowe" },
];

const SOURCE_OPTIONS: { value: "shared" | "catalog"; label: string }[] = [
  { value: "shared", label: "Wspólna biblioteka" },
  { value: "catalog", label: "Cały katalog Steam" },
];

type DetailsResponse = SteamCacheEntry & { steamAppId: number; error?: string };

/** Explore w pokoju: swipe bez eliminacji po części wspólnej bibliotek
 * uczestników. Polubienie zapisuje do rooms/{code}/liked (Task 5), pominięcie
 * po prostu przechodzi dalej -- ten sam wzorzec leniwego fetchowania co
 * SoloSwipeScreen.advance(), tylko źródło appidów to computeSharedLibrary. */
export function RoomExploreScreen({ roomCode }: { roomCode: string }) {
  const { participantId } = useParticipant(roomCode);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [multiplayer, setMultiplayer] = useState<MultiplayerFilter>("multi");
  const [genres, setGenres] = useState<string[]>([]);
  const [source, setSource] = useState<"shared" | "catalog">("shared");
  const [likedCount, setLikedCount] = useState(0);
  const [started, setStarted] = useState(false);
  const [currentCard, setCurrentCard] = useState<SwipeGame | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
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
  const autostartedRef = useRef(false);

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
    if (!started || source !== "catalog") return;
    discoverStartRef.current = 0;
    discoverExhaustedRef.current = false;
    poolRef.current = [];
    cursorRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genres]);

  // Host przychodzący z RoomUpgradeButton (SoloSwipeScreen) -- pomija ekran
  // wyboru źródła i startuje od razu z przekazanym source. Dla "shared"
  // czekamy aż subscribeToParticipants dostarczy przynajmniej naszego
  // własnego uczestnika, inaczej `shared` policzyłoby się z pustej listy.
  useEffect(() => {
    if (autostartedRef.current || started || !participantId) return;
    const autostart = searchParams.get("autostart") === "1";
    const initialSource = searchParams.get("source");
    if (!autostart || (initialSource !== "shared" && initialSource !== "catalog")) return;
    if (initialSource === "shared" && participants.length === 0) return;
    autostartedRef.current = true;
    handleStart(initialSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, started, participants]);

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
        // nie surowe (potencjalnie undefined) pole z odpowiedzi API.
        if (!matchesMultiplayerFilter(data.tags ?? [], multiplayer)) continue;
        const realTags = genres.filter((v) => v !== NEW_RELEASE_TAG && v !== UPCOMING_TAG);
        if (!matchesTagOrCommunityFilter(data.tags ?? [], candidate.tagIds, realTags)) continue;
        const wantsNew = genres.includes(NEW_RELEASE_TAG);
        const wantsSoon = genres.includes(UPCOMING_TAG);
        if (wantsNew || wantsSoon) {
          const matchesDate =
            (wantsNew && isRecentRelease(data.releaseDate)) || (wantsSoon && isUpcomingSoon(data.releaseDate));
          if (!matchesDate) continue;
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

        <div className="mt-4">
          <ToggleChip value={source} options={SOURCE_OPTIONS} onChange={setSource} columns={2} />
        </div>

        {source === "shared" && shared.length === 0 ? (
          <p className="text-text-secondary mt-6 text-center text-sm">
            Za mało uczestników z podpiętym Steamem, żeby policzyć wspólną bibliotekę.
          </p>
        ) : (
          <>
            {source === "shared" && (
              <p className="text-text-secondary mt-4 text-sm">Wspólna biblioteka: {shared.length} gier</p>
            )}
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-foreground">Jak chcecie grać?</p>
              <ToggleChip value={multiplayer} options={MULTIPLAYER_OPTIONS} onChange={setMultiplayer} columns={3} />
            </div>
            <button
              type="button"
              onClick={() => handleStart()}
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
      <div className="flex items-center gap-3 pr-12">
        <button
          type="button"
          onClick={() => setStarted(false)}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <Link href={`/room/${roomCode}/liked`} className="bg-secondary ml-auto rounded-full px-4 py-2 text-xs font-bold text-foreground">
          ❤️ {likedCount}
        </Link>
      </div>

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
