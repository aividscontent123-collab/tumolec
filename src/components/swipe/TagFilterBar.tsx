"use client";

import { useRef, useState } from "react";
import {
  Search,
  ChevronRight,
  Users,
  Users2,
  Sparkles,
  CalendarClock,
  Swords,
  Compass,
  Wand2,
  Castle,
  Cog,
  Gem,
  Smile,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { GENRE_OPTIONS } from "@/lib/steamLibrary";
import { STEAM_TAG_CATALOG } from "@/lib/steamTagCatalog";

/** Sentinel-e (nie prawdziwe tagi Steama) dla pigułek filtra daty premiery --
 * ekrany swipe (SoloSwipeScreen/RoomExploreScreen) wyciągają je z `value`
 * osobno od prawdziwych tagów przed wywołaniem matchesTagFilter. */
export const NEW_RELEASE_TAG = "__new_release__";
export const UPCOMING_TAG = "__upcoming__";

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

type Pill = { value: string; label: string; icon: LucideIcon | null };

const PINNED_TAGS: Pill[] = [
  { value: "Kooperacja", label: "Kooperacja", icon: Users2 },
  { value: "Wieloosobowa", label: "Multiplayer", icon: Users },
  { value: NEW_RELEASE_TAG, label: "Nowości", icon: Sparkles },
  { value: UPCOMING_TAG, label: "Wkrótce", icon: CalendarClock },
];

const GENRE_PILLS: Pill[] = GENRE_OPTIONS.map((g) => ({
  value: g.value,
  label: g.label,
  icon: GENRE_ICONS[g.value] ?? null,
}));

const RESERVED_VALUES = new Set([...PINNED_TAGS, ...GENRE_PILLS].map((p) => p.value));

const EXTRA_POPULAR_COUNT = 15;
const EXTRA_POPULAR_PILLS: Pill[] = STEAM_TAG_CATALOG.filter((t) => !RESERVED_VALUES.has(t.name))
  .slice(0, EXTRA_POPULAR_COUNT)
  .map((t) => ({ value: t.name, label: t.name, icon: null }));

const SEARCH_RESULT_LIMIT = 5;
const SCROLL_STEP_PX = 160;

function pillClassName(active: boolean): string {
  return active
    ? "border-accent-brand bg-card flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-semibold text-foreground"
    : "border-border bg-card flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-text-secondary";
}

/** Pasek tagów nad kartą swipe (Explore) -- dawniej GenreFilterBar (tylko 8
 * gatunków), teraz ogólny filtr: Kooperacja/Multiplayer/Nowości/Wkrótce na
 * stałe przypięte, potem 8 gatunków, potem popularne tagi Steama, na końcu
 * wyszukiwarka pełnej listy 432 tagów (STEAM_TAG_CATALOG). Zawsze widoczny,
 * przewijany w bok, wzorem Dustpile -- ten sam wizualny język co wcześniej. */
export function TagFilterBar({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((v) => v !== tag) : [...value, tag]);
  }

  function selectFromSearch(tag: string) {
    if (!value.includes(tag)) onChange([...value, tag]);
    setQuery("");
    setSearchOpen(false);
  }

  function scrollRight() {
    scrollRef.current?.scrollBy({ left: SCROLL_STEP_PX, behavior: "smooth" });
  }

  const trimmedQuery = query.trim().toLowerCase();
  const searchMatches =
    trimmedQuery.length > 0
      ? STEAM_TAG_CATALOG.filter((t) => t.name.toLowerCase().includes(trimmedQuery)).slice(0, SEARCH_RESULT_LIMIT)
      : [];

  const allPills = [...PINNED_TAGS, ...GENRE_PILLS, ...EXTRA_POPULAR_PILLS];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div
          ref={scrollRef}
          className="flex flex-1 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {allPills.map((pill) => {
            const active = value.includes(pill.value);
            const Icon = pill.icon;
            return (
              <button
                key={pill.value}
                type="button"
                onClick={() => toggle(pill.value)}
                aria-pressed={active}
                className={pillClassName(active)}
                style={active ? { boxShadow: `0 0 12px var(--accent-glow)` } : undefined}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {pill.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={scrollRight}
          aria-label="Pokaż więcej tagów"
          className="bg-secondary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          aria-label="Szukaj tagu"
          aria-pressed={searchOpen}
          className={
            searchOpen
              ? "bg-accent-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
              : "bg-secondary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground"
          }
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>

      {searchOpen && (
        <div className="flex flex-col gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj tagu…"
            autoFocus
            className="bg-card border-border rounded-xl border px-3 py-1.5 text-xs text-foreground"
          />
          {searchMatches.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {searchMatches.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectFromSearch(t.name)}
                  className="border-border bg-card flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-text-secondary"
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
