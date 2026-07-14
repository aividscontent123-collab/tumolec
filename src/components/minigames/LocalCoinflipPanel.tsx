"use client";

import { CoinFlip3D } from "@/components/coinflip/CoinFlip3D";
import { useLocalCoinflip } from "@/lib/useLocalMiniGames";

export function LocalCoinflipPanel() {
  const { coinflip, flip } = useLocalCoinflip();
  const resultLabel =
    coinflip.result === "heads" ? "Orzeł" : coinflip.result === "tails" ? "Reszka" : null;

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <CoinFlip3D coinflip={coinflip} />
      <p className="text-text-secondary text-sm">
        {resultLabel ? `Wynik: ${resultLabel}` : "Naciśnij, żeby rzucić"}
      </p>
      <button
        type="button"
        onClick={flip}
        disabled={coinflip.spinning}
        className="bg-accent-brand w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
      >
        {coinflip.spinning ? "Rzucam…" : "Rzuć monetą"}
      </button>
    </div>
  );
}
