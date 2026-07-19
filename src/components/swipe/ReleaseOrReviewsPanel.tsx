"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { daysUntil } from "@/lib/releaseCountdown";
import { reviewScoreColorClass } from "@/lib/reviewScore";
import type { SwipeGame } from "@/lib/types";

/** Panel kontekstowy: dla gier nadchodzących (releaseDate.comingSoon) pokazuje
 * odliczanie do premiery + link do listy życzeń Steam. Dla wydanych (albo bez
 * release_date w ogóle -- traktowane jak wydane) pokazuje opinie Steam + do
 * 10 najlepszych recenzji (najwięcej głosów "pomocne", zob. `parseSteamAppDetails`),
 * domyślnie zwinięte do 3 z przyciskiem "Pokaż więcej".
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
      <div className="bg-secondary shrink-0 rounded-xl p-4 text-center">
        <div className={`font-heading text-2xl font-bold ${reviewScoreColorClass(game.reviewScorePercent)}`}>
          {game.reviewScorePercent}%
        </div>
        <div className="text-text-secondary text-sm">{game.reviewSummary}</div>
        <div className="text-text-secondary mt-1 text-xs">{game.totalReviews.toLocaleString("pl-PL")} recenzji</div>
      </div>

      {game.topReviews.length > 0 && (
        <ReviewsList reviews={game.topReviews} />
      )}
    </div>
  );
}

const VISIBLE_REVIEW_COUNT = 3;

function ReviewsList({ reviews }: { reviews: SwipeGame["topReviews"] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? reviews : reviews.slice(0, VISIBLE_REVIEW_COUNT);

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
      {visible.map((review, i) => (
        <div key={i} className="bg-secondary rounded-xl p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">{review.author}</span>
            {review.votedUp ? (
              <ThumbsUp className="text-rating h-3.5 w-3.5 shrink-0" />
            ) : (
              <ThumbsDown className="text-pass h-3.5 w-3.5 shrink-0" />
            )}
          </div>
          <p className="text-text-secondary text-xs leading-snug whitespace-pre-line">{review.text}</p>
        </div>
      ))}
      {!showAll && reviews.length > VISIBLE_REVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-accent-brand text-center text-xs font-semibold"
        >
          Pokaż więcej recenzji
        </button>
      )}
    </div>
  );
}
