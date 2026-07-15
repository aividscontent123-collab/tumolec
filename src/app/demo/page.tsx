import { SwipeCard } from "@/components/swipe/SwipeCard";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import type { SwipeGame } from "@/lib/types";

// Statyczna wizytówka designu (wariant 1a) z danymi demo — niezależna od
// realnego pokoju/Firestore. Prawdziwa talia swipe: /room/[code]/swipe.
const demoGame: SwipeGame = {
  steamAppId: 728880,
  title: "Overcooked! 2",
  tags: ["Co-op", "Chaotyczne", "1-4 graczy"],
  reviewScorePercent: 96,
  reviewSummary: "Bardzo pozytywne",
  shortDescription: "Rakietowa, chaotyczna kooperacyjna gra kucharska dla 1-4 graczy.",
  developers: ["Ghost Town Games"],
  releaseDate: { comingSoon: false, date: "7 sierpnia 2018" },
  screenshots: [],
  trailerHlsUrl: null,
  trailerThumbnail: null,
  totalReviews: 12000,
  topReviews: [],
};

const participants = [
  { initial: "M", color: "#c2703d" },
  { initial: "K", color: "#2fb3a0" },
  { initial: "A", color: "#8b5cf6" },
];

export default function DemoPage() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 px-[22px] pt-[18px] pb-2.5">
        <button
          type="button"
          aria-label="Wstecz"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg"
          style={{ backgroundColor: "oklch(0.24 0.02 265)" }}
        >
          ‹
        </button>

        <div className="flex flex-1 flex-col items-center gap-1.5">
          <span className="font-heading text-[15px] font-bold text-foreground">
            Wieczór ekipy
          </span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-[22px] rounded-full"
                style={{
                  backgroundColor: i === 0 ? "var(--accent-brand)" : "oklch(0.3 0.02 265)",
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex -space-x-2">
          {participants.map((p) => (
            <div
              key={p.initial}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: p.color, boxShadow: "0 0 0 2px oklch(0.1 0.02 268)" }}
            >
              {p.initial}
            </div>
          ))}
        </div>
      </header>

      <p className="text-text-secondary pb-2 text-center text-xs tracking-widest">
        RUNDA 1 · GRA 3 Z 8
      </p>

      <main className="min-h-0 flex-1 px-[22px] pb-[18px]">
        <div className="relative h-full">
          <div
            className="rounded-card absolute inset-2 -rotate-3 opacity-40"
            style={{ backgroundColor: "oklch(0.2 0.02 265)" }}
          />
          <div
            className="rounded-card absolute inset-1 rotate-2 opacity-60"
            style={{ backgroundColor: "oklch(0.22 0.02 265)" }}
          />
          <SwipeCard game={demoGame} />
        </div>
      </main>

      <SwipeActionButtons />
    </div>
  );
}
