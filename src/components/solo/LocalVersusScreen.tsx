"use client";

import { useLocalVersus } from "@/lib/useLocalVersus";
import { SwipeCard } from "@/components/swipe/SwipeCard";
import { GameDetailLayout } from "@/components/swipe/GameDetailLayout";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { SoloTieBreaker } from "@/components/solo/SoloTieBreaker";
import { WinnerScreen } from "@/components/room/WinnerScreen";
import type { SwipeGame } from "@/lib/types";

/** Versus solo: bracket eliminacji na liście Polubionych, bez Firestore.
 * `games` to pełne dane (nie same appidy) -- SoloLikedScreen już je ma
 * wczytane, unikamy ponownego fetchowania /api/steam/details tutaj. */
export function LocalVersusScreen({ games, onExit }: { games: SwipeGame[]; onExit: () => void }) {
  const gameByAppId = new Map(games.map((g) => [g.steamAppId, g]));
  const { pool, deck, poolSize, winner, vote, tieBreak, startTieBreak, resolveTieBreak, restart } =
    useLocalVersus(games.map((g) => g.steamAppId));

  if (winner !== null) {
    return <WinnerScreen game={gameByAppId.get(winner)} onReroll={restart} />;
  }

  const currentGame = gameByAppId.get(deck[0]);
  if (!currentGame) {
    return <p className="text-text-secondary p-6 text-center text-sm">Przygotowuję rundę…</p>;
  }

  const currentAppId = currentGame.steamAppId;
  function handleSwipe(direction: "left" | "right") {
    vote(currentAppId, direction);
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex items-center gap-3 px-[22px] pt-[18px]">
        <button
          type="button"
          onClick={onExit}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <p className="text-text-secondary flex-1 text-center text-xs tracking-widest">
          GRA {poolSize - deck.length + 1} Z {poolSize}
        </p>
      </div>
      <main className="min-h-0 flex-1 px-[22px] pb-[18px] lg:flex lg:flex-col lg:justify-center">
        <GameDetailLayout key={currentGame.steamAppId} game={currentGame}>
          <SwipeCard
            key={currentGame.steamAppId}
            game={currentGame}
            onSwipe={tieBreak ? () => {} : handleSwipe}
          />
        </GameDetailLayout>
      </main>
      {poolSize === 2 && (
        <SoloTieBreaker
          candidates={[pool[0], pool[1]]}
          gameByAppId={gameByAppId}
          tieBreak={tieBreak}
          onChooseMethod={startTieBreak}
          onResolved={resolveTieBreak}
        />
      )}
      {!tieBreak && (
        <SwipeActionButtons onPass={() => handleSwipe("left")} onLike={() => handleSwipe("right")} />
      )}
    </div>
  );
}
