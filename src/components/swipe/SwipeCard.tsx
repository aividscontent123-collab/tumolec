"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useDrag } from "@use-gesture/react";
import { Clock, ExternalLink } from "lucide-react";
import type { SwipeGame } from "@/lib/types";
import { decideSwipeDirection } from "@/lib/swipeGesture";
import { steamLibraryPortraitUrl } from "@/lib/steamImages";

const SPRING_BACK = { type: "spring", stiffness: 500, damping: 30 } as const;

/** Karta gry w talii swipe. @use-gesture/react czyta gest przeciągania,
 * framer-motion animuje pozycję/rotację/poświatę. Fling wywołuje `onSwipe`
 * -- ten sam handler co przyciski w SwipeActionButtons, więc decyzja
 * (zapis swipe'a do Firestore) ma jedno miejsce w kodzie, gest tylko ją
 * wyzwala szybciej. Wizualny spec: work/active/Tumolec.md, wariant 1a. */
export function SwipeCard({
  game,
  onSwipe,
}: {
  game: SwipeGame;
  onSwipe?: (direction: "left" | "right") => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-320, 320], [-16, 16]);
  const likeOpacity = useTransform(x, [24, 140], [0, 1]);
  const passOpacity = useTransform(x, [-140, -24], [1, 0]);
  const glowShadow = useTransform(
    x,
    [-220, 0, 220],
    [
      "0 0 70px 14px rgba(239,68,68,0.5)",
      "0 20px 50px rgba(0,0,0,0.5)",
      "0 0 70px 14px rgba(34,197,94,0.5)",
    ],
  );

  // Liczone świeżo z propsa co render (nie w useState) -- game.coverImageUrl
  // potrafi doładować się asynchronicznie już PO zamontowaniu karty (osobny
  // listener Firestore na steam_cache), a karta nie remountuje się przy tej
  // zmianie (key w SwipeScreen to steamAppId, nie coverImageUrl). Trzymanie
  // tylko URL-a w stanie zamroziłoby kartę na placeholderze na stałe.
  // Stan trzyma wyłącznie "czy pionowy portret zawiódł" dla BIEŻĄCEGO
  // steamAppId -- reset przy zmianie gry następuje przez remount (key).
  const [portraitFailed, setPortraitFailed] = useState(false);
  const imgSrc = game.coverImageUrl
    ? portraitFailed
      ? game.coverImageUrl
      : steamLibraryPortraitUrl(game.steamAppId)
    : undefined;

  const bind = useDrag(({ movement: [mx, my], velocity: [vx], last }) => {
    if (!last) {
      x.set(mx);
      y.set(my);
      return;
    }
    const direction = decideSwipeDirection(mx, vx);
    if (direction && onSwipe) {
      animate(x, direction === "right" ? 700 : -700, { duration: 0.3, ease: "easeOut" });
      animate(y, my, { duration: 0.3, ease: "easeOut" });
      onSwipe(direction);
    } else {
      animate(x, 0, SPRING_BACK);
      animate(y, 0, SPRING_BACK);
    }
  });

  // `bind()` includes a native `onDrag` (HTML5 drag events) that collides with
  // framer-motion's own (unused) drag prop of the same name -- cast past it,
  // we drive the gesture through @use-gesture's pointer handlers, not motion's.
  const releaseYear = game.releaseDate?.date.match(/\d{4}$/u)?.[0];
  const subtitle = [releaseYear, game.developers.join(", ")].filter(Boolean).join(" · ");

  return (
    <motion.div
      {...(bind() as object)}
      style={{ x, y, rotate, boxShadow: glowShadow, touchAction: "pan-y" }}
      className="rounded-card bg-card border-border relative flex h-full w-full cursor-grab flex-col overflow-hidden border active:cursor-grabbing"
    >
      <motion.div
        style={{ opacity: likeOpacity }}
        className="border-rating text-rating absolute top-6 left-6 z-10 -rotate-12 rounded-xl border-4 px-3 py-1 text-xl font-extrabold tracking-wide uppercase"
      >
        Gramy
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="border-pass text-pass absolute top-6 right-6 z-10 rotate-12 rounded-xl border-4 px-3 py-1 text-xl font-extrabold tracking-wide uppercase"
      >
        Pas
      </motion.div>

      <div className="relative mx-auto mt-5 aspect-[3/4] w-3/5 shrink-0 overflow-hidden rounded-xl lg:w-2/5 lg:max-h-[38%]">
        {game.coverImageUrl && imgSrc ? (
          <Image
            src={imgSrc}
            alt={game.title}
            fill
            className="pointer-events-none object-cover"
            sizes="(max-width: 500px) 60vw, 300px"
            draggable={false}
            onError={() => {
              if (!portraitFailed) setPortraitFailed(true);
            }}
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
        {game.hltbMainStory != null && (
          <div className="bg-card/90 absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
            <Clock className="h-3 w-3" />
            ~{game.hltbMainStory}h
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-[22px]">
        <h2 className="font-heading text-center text-[24px] leading-tight font-bold text-foreground">
          {game.title}
        </h2>
        {subtitle && <p className="text-text-secondary text-center text-sm">{subtitle}</p>}

        <div className="flex flex-wrap justify-center gap-2">
          {game.tags.map((tag) => (
            <span
              key={tag}
              className="bg-secondary rounded-full px-3 py-1 text-xs font-semibold text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        {game.shortDescription && (
          <p className="text-text-secondary text-sm">{game.shortDescription}</p>
        )}

        <a
          href={`https://store.steampowered.com/app/${game.steamAppId}`}
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="bg-secondary mx-auto mt-1 inline-flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/15 active:scale-95"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Szczegóły na Steam
        </a>
      </div>
    </motion.div>
  );
}
