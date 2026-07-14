"use client";

import { useState } from "react";
import Link from "next/link";
import { LocalCoinflipPanel } from "@/components/minigames/LocalCoinflipPanel";
import { LocalWheelPanel } from "@/components/minigames/LocalWheelPanel";

type Mode = { kind: "room"; roomCode: string } | { kind: "solo" };
type Panel = "coinflip" | "wheel" | null;

/** Pływający przycisk otwierający hub mini-gier. Tryb "room": linkuje do
 * istniejących tras pokoju (zero nowej logiki, tylko relokacja punktu
 * wejścia z 3 przycisków lobby na 1 przycisk + hub). Tryb "solo": renderuje
 * lokalne panele (bez Firestore, bez pokoju) bezpośrednio w hubie. */
export function MiniGameLauncher({ mode }: { mode: Mode }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  function close() {
    setOpen(false);
    setPanel(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mini-gry"
        className="bg-accent-brand fixed right-4 bottom-6 z-20 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white shadow-[0_8px_24px_var(--accent-brand-soft)]"
      >
        🎲
      </button>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={close}>
          <div className="bg-background w-full rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold text-foreground">Mini-gry</h2>
              <button type="button" onClick={close} aria-label="Zamknij" className="text-text-secondary text-2xl">
                ✕
              </button>
            </div>

            {panel === "coinflip" ? (
              <LocalCoinflipPanel />
            ) : panel === "wheel" ? (
              <LocalWheelPanel />
            ) : mode.kind === "solo" ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setPanel("coinflip")}
                  className="bg-secondary rounded-full py-3 text-sm font-bold text-foreground"
                >
                  Rzut monetą
                </button>
                <button
                  type="button"
                  onClick={() => setPanel("wheel")}
                  className="bg-secondary rounded-full py-3 text-sm font-bold text-foreground"
                >
                  Koło fortuny
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Link
                  href={`/room/${mode.roomCode}/coinflip`}
                  className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
                >
                  Rzut monetą
                </Link>
                <Link
                  href={`/room/${mode.roomCode}/wheel`}
                  className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
                >
                  Koło fortuny
                </Link>
                <Link
                  href={`/room/${mode.roomCode}/plinko`}
                  className="bg-secondary rounded-full py-3 text-center text-sm font-bold text-foreground"
                >
                  Plinko
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
