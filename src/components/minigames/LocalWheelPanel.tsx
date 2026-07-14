"use client";

import { useState } from "react";
import { WheelCanvas } from "@/components/wheel/WheelCanvas";
import { useLocalWheel } from "@/lib/useLocalMiniGames";

export function LocalWheelPanel() {
  const { wheel, addEntry, removeEntry, spin, finishSpin } = useLocalWheel();
  const [value, setValue] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const entry = value.trim();
    if (!entry) return;
    setValue("");
    addEntry(entry);
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <WheelCanvas wheel={wheel} onSpinAnimationComplete={finishSpin} />

      {wheel.winner && !wheel.spinning && (
        <p className="text-center text-sm text-foreground">
          Wygrywa: <span className="font-bold">{wheel.winner}</span>
        </p>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Dodaj do koła…"
          maxLength={40}
          className="bg-card border-border flex-1 rounded-xl border px-4 py-3 text-sm text-foreground"
        />
        <button type="submit" className="bg-accent-brand rounded-xl px-4 text-sm font-bold text-white">
          Dodaj
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {wheel.entries.map((entry) => (
          <li
            key={entry}
            className="bg-card flex items-center justify-between rounded-xl px-5 py-3.5 text-base text-foreground"
          >
            {entry}
            <button
              type="button"
              aria-label={`Usuń ${entry}`}
              onClick={() => removeEntry(entry)}
              className="text-text-secondary flex h-8 w-8 items-center justify-center text-lg"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={wheel.entries.length < 2 || wheel.spinning}
        onClick={spin}
        className="bg-accent-brand rounded-full py-4 text-base font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
      >
        {wheel.spinning ? "Kręcimy…" : wheel.entries.length < 2 ? "Dodaj co najmniej 2 wpisy" : "Losuj"}
      </button>
    </div>
  );
}
