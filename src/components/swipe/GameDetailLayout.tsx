"use client";

import { useState } from "react";
import { MediaPanel } from "@/components/swipe/MediaPanel";
import { ReleaseOrReviewsPanel } from "@/components/swipe/ReleaseOrReviewsPanel";
import type { SwipeGame } from "@/lib/types";

type MobilePanel = "media" | "info" | null;

/** Otacza kartę swipe (przekazaną jako children -- ten komponent nie zna
 * `onSwipe`/`key`, tylko układa panele wokół) panelami mediów i premiery/opinii.
 * Desktop (lg+): 3 kolumny widoczne naraz. Telefon: karta zawsze widoczna,
 * 2 chipsy nad nią rozwijają odpowiedni panel jako akordeon -- swipe nigdy nie
 * traci miejsca na ekranie. Panel bez danych (MediaPanel zwraca null) chowa
 * też swój chip na telefonie. */
export function GameDetailLayout({ game, children }: { game: SwipeGame; children: React.ReactNode }) {
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);

  const media = <MediaPanel game={game} />;
  const info = <ReleaseOrReviewsPanel game={game} />;
  const hasMedia = game.trailerHlsUrl !== null || game.screenshots.length > 0;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[340px_1fr_340px]">
      {hasMedia && <div className="hidden lg:block lg:overflow-y-auto">{media}</div>}

      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:contents">
        <div className="flex gap-2 lg:hidden">
          {hasMedia && (
            <button
              type="button"
              onClick={() => setMobilePanel((p) => (p === "media" ? null : "media"))}
              className={`flex-1 rounded-full py-2 text-xs font-bold ${mobilePanel === "media" ? "bg-accent-brand text-white" : "bg-secondary text-foreground"}`}
            >
              Media
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobilePanel((p) => (p === "info" ? null : "info"))}
            className={`flex-1 rounded-full py-2 text-xs font-bold ${mobilePanel === "info" ? "bg-accent-brand text-white" : "bg-secondary text-foreground"}`}
          >
            Info
          </button>
        </div>

        {mobilePanel === "media" && hasMedia && <div className="lg:hidden">{media}</div>}
        {mobilePanel === "info" && <div className="lg:hidden">{info}</div>}

        <div className="min-h-0 flex-1">{children}</div>
      </div>

      <div className="hidden lg:block lg:overflow-y-auto">{info}</div>
    </div>
  );
}
