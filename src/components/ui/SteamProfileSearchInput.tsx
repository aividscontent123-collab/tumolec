"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { SteamProfileResult } from "@/lib/steamCommunitySearch";

/** Debounced wyszukiwarka profilu Steam po nazwie (bez logowania), z fallbackiem
 * na wklejenie linku bezpośrednio -- wspólna dla ekranu startowego solo i
 * dołączania do pokoju po kodzie, oba miejsca gdzie użytkownik podaje swój
 * profil Steam. */
export function SteamProfileSearchInput({
  value,
  onChange,
  placeholder = "Szukaj po nazwie…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<SteamProfileResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = value.trim();
    // Nie szukaj, gdy user już wkleił pełny link -- wyszukiwarka jest tylko
    // dla wpisywania nazwy, wklejony link idzie bezpośrednio dalej niezmieniony.
    if (trimmed.length < 2 || trimmed.includes("steamcommunity.com")) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/steam/find-profile?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setResults(res.ok ? data.results : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [value]);

  function selectResult(result: SteamProfileResult) {
    onChange(result.profileUrl);
    setResults([]);
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-card border-border w-full rounded-xl border px-4 py-3 text-foreground"
      />
      {(results.length > 0 || searching) && (
        <div className="bg-popover border-border absolute top-full right-0 left-0 z-10 mt-2 max-h-80 overflow-y-auto rounded-xl border">
          {searching && <p className="text-text-secondary p-3 text-sm">Szukam…</p>}
          {results.map((r) => (
            <button
              key={r.profileUrl}
              type="button"
              onClick={() => selectResult(r)}
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/5"
            >
              {r.avatarUrl && (
                <Image
                  src={r.avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              )}
              <span className="text-sm text-foreground">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
