"use client";

import { Swords, Compass, Wand2, Castle, Cog, Gem, Smile, Trophy, type LucideIcon } from "lucide-react";
import { GENRE_OPTIONS } from "@/lib/steamLibrary";

const GENRE_ICONS: Record<string, LucideIcon> = {
  Akcja: Swords,
  Przygodowe: Compass,
  RPG: Wand2,
  Strategie: Castle,
  Symulacje: Cog,
  Niezależne: Gem,
  Rekreacyjne: Smile,
  Sportowe: Trophy,
};

/** Pasek gatunków nad kartą swipe (Explore) -- zawsze widoczny, przewijany
 * w bok, wzorem Dustpile. W przeciwieństwie do MultiToggleChip (siatka na
 * ekranach ustawień) to jeden przewijany rząd małych pigułek ikona+etykieta,
 * bo ma żyć NAD GameDetailLayout bez zasłaniania karty. */
export function GenreFilterBar({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  function toggle(genre: string) {
    onChange(value.includes(genre) ? value.filter((g) => g !== genre) : [...value, genre]);
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {GENRE_OPTIONS.map((opt) => {
        const active = value.includes(opt.value);
        const Icon = GENRE_ICONS[opt.value];
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            className={
              active
                ? "border-accent-brand bg-card flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold text-foreground"
                : "border-border bg-card flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-text-secondary"
            }
            style={active ? { boxShadow: `0 0 12px var(--accent-glow)` } : undefined}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
