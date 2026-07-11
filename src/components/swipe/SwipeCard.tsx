import Image from "next/image";
import type { SwipeGame } from "@/lib/types";

/** Single game card in the swipe deck. Purely presentational — no drag/gesture
 * logic yet (Faza 1). Visual spec: work/active/Tumolec.md, wariant 1a. */
export function SwipeCard({ game }: { game: SwipeGame }) {
  return (
    <div className="swipe-card rounded-card relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        {game.coverImageUrl ? (
          <Image
            src={game.coverImageUrl}
            alt={game.title}
            fill
            className="object-cover"
            sizes="(max-width: 500px) 100vw, 500px"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              backgroundColor: "#3a2420",
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0 14px, transparent 14px 28px)",
            }}
          />
        )}
      </div>

      <div className="absolute top-0 right-0 left-0 flex justify-end p-4">
        <div className="rounded-full px-3.5 py-2 text-right backdrop-blur-md" style={{ backgroundColor: "rgba(10,12,20,0.55)" }}>
          <div className="font-heading text-sm font-bold" style={{ color: "var(--rating)" }}>
            {game.reviewScorePercent}% Steam
          </div>
          <div className="text-text-secondary text-[10px]">{game.reviewSummary}</div>
        </div>
      </div>

      <div className="swipe-card-scrim absolute inset-x-0 bottom-0 flex flex-col gap-2 p-[22px] pt-24">
        <h2 className="font-heading text-[30px] leading-tight font-bold text-foreground">
          {game.title}
        </h2>
        <div className="flex flex-wrap gap-2">
          {game.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border px-3 py-1 text-xs font-semibold text-foreground"
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                borderColor: "rgba(255,255,255,0.14)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
