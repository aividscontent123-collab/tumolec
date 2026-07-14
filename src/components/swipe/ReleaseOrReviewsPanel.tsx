"use client";

import { daysUntil } from "@/lib/releaseCountdown";
import type { SwipeGame } from "@/lib/types";

/** Panel kontekstowy: dla gier nadchodzących (releaseDate.comingSoon) pokazuje
 * odliczanie do premiery + link do listy życzeń Steam. Dla wydanych (albo bez
 * release_date w ogóle -- traktowane jak wydane) pokazuje opinie Steam.
 * Świadomie BEZ hype score/obserwujących/graczy demo -- Steam Store API tych
 * danych nie ma, nie są przybliżane fejkowymi liczbami. */
export function ReleaseOrReviewsPanel({ game }: { game: SwipeGame }) {
  const isUpcoming = game.releaseDate?.comingSoon === true;

  if (isUpcoming) {
    const days = daysUntil(game.releaseDate!.date);
    return (
      <div className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-4">
        <h3 className="font-heading text-sm font-bold text-foreground">Przed premierą</h3>
        <div className="bg-secondary rounded-xl p-4 text-center">
          {days !== null && (
            <div className="font-heading text-2xl font-bold text-foreground">
              {days > 0 ? `Za ${days} dni` : days === 0 ? "Dziś!" : "Już dostępne"}
            </div>
          )}
          <div className="text-text-secondary text-sm">{game.releaseDate!.date}</div>
        </div>
        <a
          href={`https://store.steampowered.com/app/${game.steamAppId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-accent-brand rounded-full py-3 text-center text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
        >
          Dodaj do listy życzeń
        </a>
      </div>
    );
  }

  return (
    <div className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-4">
      <h3 className="font-heading text-sm font-bold text-foreground">Opinie Steam</h3>
      <div className="bg-secondary rounded-xl p-4 text-center">
        <div className="font-heading text-rating text-2xl font-bold">{game.reviewScorePercent}%</div>
        <div className="text-text-secondary text-sm">{game.reviewSummary}</div>
        <div className="text-text-secondary mt-1 text-xs">{game.totalReviews.toLocaleString("pl-PL")} recenzji</div>
      </div>
    </div>
  );
}
