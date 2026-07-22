"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getLocalVersusHistory } from "@/lib/localVersusHistory";
import { getLocalLiked } from "@/lib/localLiked";
import { computeStats, type Stats, type WinEvent } from "@/lib/stats";
import type { SteamCacheEntry } from "@/lib/steam";

export function SoloStatsScreen({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [cacheByAppId, setCacheByAppId] = useState<Record<number, SteamCacheEntry | undefined>>({});

  useEffect(() => {
    let cancelled = false;
    const history = getLocalVersusHistory();
    const likedAppIds = getLocalLiked();
    const wins: WinEvent[] = history.map((h) => ({ steamAppId: h.steamAppId, wonAt: h.wonAt }));
    const ids = [...new Set([...wins.map((w) => w.steamAppId), ...likedAppIds])];

    Promise.all(
      ids.map(async (id) => {
        const snap = await getDoc(doc(db, "steam_cache", String(id)));
        return [id, snap.exists() ? (snap.data() as SteamCacheEntry) : undefined] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const cache = Object.fromEntries(entries);
      setCacheByAppId(cache);
      setStats(computeStats(wins, cache, likedAppIds));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="bg-app-gradient flex h-dvh flex-col gap-4 px-[22px] pt-[18px] pb-[30px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Wstecz"
          className="bg-secondary flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-lg text-foreground"
        >
          ‹
        </button>
        <h1 className="font-heading text-[18px] font-bold text-foreground">Statystyki</h1>
      </div>

      {!stats ? (
        <p className="text-text-secondary py-8 text-center text-sm">Wczytuję…</p>
      ) : stats.totalWins === 0 ? (
        <p className="text-text-secondary py-8 text-center text-sm">
          Jeszcze nie rozegrałeś żadnego Versus 🎮
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground">
                Rozegrałeś {stats.totalWins} {stats.totalWins === 1 ? "Versus" : "razy Versus"} 🏆
              </p>
              <ul className="flex flex-col gap-2">
                {stats.topGames.map((g) => {
                  const cover = cacheByAppId[g.steamAppId]?.headerImageUrl;
                  const name = cacheByAppId[g.steamAppId]?.name ?? "…";
                  return (
                    <li key={g.steamAppId} className="bg-card border-border flex items-center gap-3 rounded-xl border p-3">
                      {cover && (
                        <Image src={cover} alt="" width={96} height={48} className="h-12 w-24 shrink-0 rounded-lg object-cover" />
                      )}
                      <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                      <span className="text-text-secondary ml-auto shrink-0 text-xs font-semibold">{g.wins}×</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground">Ulubione gatunki</p>
              {stats.topGenres.length === 0 ? (
                <p className="text-text-secondary text-xs">Brak danych.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {stats.topGenres.map((g) => (
                    <li key={g.tag} className="bg-secondary rounded-full px-3 py-1.5 text-xs font-semibold text-foreground">
                      {g.tag} ({g.count})
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground">Czas gry</p>
              <p className="text-text-secondary text-xs">
                Łącznie zagracie ok. {stats.totalHltbHours}h, jeśli dokończycie wszystko.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground">Aktywność</p>
              <p className="text-text-secondary text-xs">
                {stats.activity.last7days} {stats.activity.last7days === 1 ? "gra" : "gier"} w ostatnim tygodniu,{" "}
                {stats.activity.last30days} w ostatnim miesiącu
                {stats.activity.mostActiveWeekday ? `, najbardziej aktywny dzień: ${stats.activity.mostActiveWeekday}` : ""}.
              </p>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
