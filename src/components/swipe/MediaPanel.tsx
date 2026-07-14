"use client";

import { useState } from "react";
import Image from "next/image";
import { HlsVideo } from "@/components/swipe/HlsVideo";
import type { SwipeGame } from "@/lib/types";

/** Panel mediów gry: trailer (jeśli jest) + siatka miniatur screenshotów
 * (jeśli są). Renderuje null gdy nie ma ani jednego ani drugiego -- pozwala
 * rodzicowi (GameDetailLayout) całkowicie pominąć kolumnę/chip zamiast
 * pokazywać pustą sekcję. */
export function MediaPanel({ game }: { game: SwipeGame }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (!game.trailerHlsUrl && game.screenshots.length === 0) return null;

  return (
    <div className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-4">
      {game.trailerHlsUrl && (
        <HlsVideo hlsUrl={game.trailerHlsUrl} poster={game.trailerThumbnail ?? undefined} />
      )}

      {game.screenshots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {game.screenshots.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => setLightbox(url)}
              className="relative aspect-video overflow-hidden rounded-lg"
            >
              <Image src={url} alt="" fill className="object-cover" sizes="120px" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
