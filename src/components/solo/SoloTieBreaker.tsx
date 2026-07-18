"use client";

import { CoinFlip3D } from "@/components/coinflip/CoinFlip3D";
import { WheelCanvas } from "@/components/wheel/WheelCanvas";
import type { SwipeGame } from "@/lib/types";

/** Wersja solo RoomTieBreaker -- bez etapu zgód (1 uczestnik = zgoda trywialna),
 * bez Firestore. Widoczny wyłącznie gdy w puli zostały dokładnie 2 gry. */
export function SoloTieBreaker({
  candidates,
  gameByAppId,
  tieBreak,
  onChooseMethod,
  onResolved,
}: {
  candidates: [number, number];
  gameByAppId: Map<number, SwipeGame>;
  tieBreak: {
    method: "coin" | "wheel";
    resultAppId: number;
    triggeredAt: { toMillis: () => number };
    extraTurns: number;
  } | null;
  onChooseMethod: (method: "coin" | "wheel") => void;
  onResolved: () => void;
}) {
  const gameA = gameByAppId.get(candidates[0]);
  const gameB = gameByAppId.get(candidates[1]);
  if (!gameA || !gameB) return null;

  if (tieBreak?.method === "coin") {
    return (
      <div className="flex flex-col items-center gap-3 py-3">
        <CoinFlip3D
          coinflip={{
            result: tieBreak.resultAppId === candidates[0] ? "heads" : "tails",
            spinning: true,
            triggeredAt: tieBreak.triggeredAt,
          }}
          headsLabel={gameA.title}
          tailsLabel={gameB.title}
          onFlipComplete={onResolved}
        />
      </div>
    );
  }

  if (tieBreak?.method === "wheel") {
    return (
      <div className="flex flex-col items-center gap-3 py-3">
        <WheelCanvas
          wheel={{
            entries: [gameA.title, gameB.title],
            winner: gameByAppId.get(tieBreak.resultAppId)?.title ?? null,
            spinning: true,
            extraTurns: tieBreak.extraTurns,
          }}
          onSpinAnimationComplete={onResolved}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 pb-3">
      <p className="text-text-secondary text-xs">Nie możecie się zdecydować?</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onChooseMethod("coin")}
          className="bg-accent-brand rounded-full px-5 py-2 text-sm font-bold text-white"
        >
          Moneta
        </button>
        <button
          type="button"
          onClick={() => onChooseMethod("wheel")}
          className="bg-accent-brand rounded-full px-5 py-2 text-sm font-bold text-white"
        >
          Koło
        </button>
      </div>
    </div>
  );
}
