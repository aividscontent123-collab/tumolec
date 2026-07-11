"use client";

import Image from "next/image";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useDrag } from "@use-gesture/react";
import { ExternalLink } from "lucide-react";
import type { SwipeGame } from "@/lib/types";
import { decideSwipeDirection } from "@/lib/swipeGesture";

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
  return (
    <motion.div
      {...(bind() as object)}
      style={{ x, y, rotate, boxShadow: glowShadow, touchAction: "pan-y" }}
      className="rounded-card relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
    >
      <div className="absolute inset-0">
        {game.coverImageUrl ? (
          <Image
            src={game.coverImageUrl}
            alt={game.title}
            fill
            className="pointer-events-none object-cover"
            sizes="(max-width: 500px) 100vw, 500px"
            draggable={false}
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

      <motion.div
        style={{ opacity: likeOpacity }}
        className="border-rating text-rating absolute top-6 left-6 -rotate-12 rounded-xl border-4 px-3 py-1 text-xl font-extrabold tracking-wide uppercase"
      >
        Gramy
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="border-pass text-pass absolute top-6 right-6 rotate-12 rounded-xl border-4 px-3 py-1 text-xl font-extrabold tracking-wide uppercase"
      >
        Pas
      </motion.div>

      <div className="absolute top-0 right-0 left-0 flex justify-end p-4">
        <div
          className="rounded-full px-3.5 py-2 text-right backdrop-blur-md"
          style={{ backgroundColor: "rgba(10,12,20,0.55)" }}
        >
          <div className="font-heading text-rating text-sm font-bold">
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
        <a
          href={`https://store.steampowered.com/app/${game.steamAppId}`}
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/15 active:scale-95"
          style={{
            backgroundColor: "rgba(255,255,255,0.1)",
            borderColor: "rgba(255,255,255,0.14)",
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Szczegóły na Steam
        </a>
      </div>
    </motion.div>
  );
}
