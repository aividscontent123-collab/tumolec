"use client";

import { useState } from "react";
import { triggerCoinflip } from "@/lib/rooms";

const FLIP_DURATION_MS = 2200;

export function FlipButton({ roomCode }: { roomCode: string }) {
  const [flipping, setFlipping] = useState(false);

  async function handleClick() {
    setFlipping(true);
    await triggerCoinflip(roomCode);
    setTimeout(() => setFlipping(false), FLIP_DURATION_MS);
  }

  return (
    <button
      onClick={handleClick}
      disabled={flipping}
      className="rounded-full py-3 text-center text-sm font-bold text-white disabled:opacity-50"
      style={{ backgroundColor: "var(--accent-brand)", boxShadow: "0 8px 24px var(--accent-brand-soft)" }}
    >
      {flipping ? "Rzucam…" : "Rzuć monetą"}
    </button>
  );
}
