"use client";

import { useState } from "react";
import { addWheelEntry, removeWheelEntry, triggerWheelSpin, type WheelState } from "@/lib/rooms";

export function WheelControls({ roomCode, wheel }: { roomCode: string; wheel: WheelState }) {
  const [value, setValue] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const entry = value.trim();
    if (!entry || wheel.entries.includes(entry)) return;
    setValue("");
    await addWheelEntry(roomCode, entry);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Dodaj do koła…"
          maxLength={40}
          className="flex-1 rounded-xl border px-4 py-3 text-sm text-foreground"
          style={{ backgroundColor: "oklch(0.2 0.02 265)", borderColor: "oklch(0.3 0.02 265)" }}
        />
        <button
          type="submit"
          className="rounded-xl px-4 text-sm font-bold text-white"
          style={{ backgroundColor: "var(--accent-brand)" }}
        >
          Dodaj
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {wheel.entries.map((entry) => (
          <li
            key={entry}
            className="flex items-center justify-between rounded-xl px-4 py-2 text-sm text-foreground"
            style={{ backgroundColor: "oklch(0.2 0.02 265)" }}
          >
            {entry}
            <button
              type="button"
              aria-label={`Usuń ${entry}`}
              onClick={() => removeWheelEntry(roomCode, entry)}
              className="text-text-secondary"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={wheel.entries.length < 2 || wheel.spinning}
        onClick={() => triggerWheelSpin(roomCode)}
        className="rounded-full py-3 text-sm font-bold text-white disabled:opacity-50"
        style={{ backgroundColor: "var(--accent-brand)", boxShadow: "0 8px 24px var(--accent-brand-soft)" }}
      >
        {wheel.spinning ? "Kręcimy…" : wheel.entries.length < 2 ? "Dodaj co najmniej 2 wpisy" : "Losuj"}
      </button>
    </div>
  );
}
