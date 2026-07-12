"use client";

import { useEffect, useState } from "react";
import {
  createPackage,
  subscribeToPackages,
  addGamesToPool,
  type GamePackage,
  type PoolGame,
} from "@/lib/rooms";
import { newGameIdsForPool } from "@/lib/packages";

export function PackageControls({
  roomCode,
  participantId,
  games,
}: {
  roomCode: string;
  participantId: string;
  games: PoolGame[];
}) {
  const [packages, setPackages] = useState<GamePackage[]>([]);
  const [mode, setMode] = useState<null | "save" | "load">(null);
  const [name, setName] = useState("");

  useEffect(() => subscribeToPackages(setPackages), []);

  const activeIds = games.filter((g) => g.status === "active").map((g) => g.steamAppId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || activeIds.length === 0) return;
    await createPackage(trimmed, activeIds);
    setName("");
    setMode(null);
  }

  async function handleLoad(pkg: GamePackage) {
    await addGamesToPool(roomCode, newGameIdsForPool(pkg.gameIds, games), participantId);
    setMode(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === "save" ? null : "save")}
          disabled={activeIds.length === 0}
          className="bg-secondary flex-1 rounded-full py-2 text-xs font-bold text-foreground disabled:opacity-50"
        >
          Zapisz jako paczkę
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "load" ? null : "load")}
          className="bg-secondary flex-1 rounded-full py-2 text-xs font-bold text-foreground"
        >
          Dodaj z paczki
        </button>
      </div>

      {mode === "save" && (
        <form onSubmit={handleSave} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nazwa paczki…"
            maxLength={60}
            className="bg-card border-border flex-1 rounded-xl border px-4 py-2 text-sm text-foreground"
          />
          <button
            type="submit"
            className="bg-accent-brand rounded-xl px-4 text-sm font-bold text-white"
          >
            Zapisz
          </button>
        </form>
      )}

      {mode === "load" && (
        <ul className="flex flex-col gap-2">
          {packages.length === 0 ? (
            <li className="text-text-secondary py-2 text-center text-xs">
              Brak zapisanych paczek.
            </li>
          ) : (
            packages.map((pkg) => (
              <li
                key={pkg.id}
                className="bg-card border-border flex items-center justify-between rounded-xl border px-4 py-2 text-sm text-foreground"
              >
                <span className="min-w-0 flex-1 truncate">
                  {pkg.name}{" "}
                  <span className="text-text-secondary text-xs">({pkg.gameCount})</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleLoad(pkg)}
                  className="bg-accent-brand shrink-0 rounded-full px-3 py-1 text-xs font-bold text-white"
                >
                  Dodaj
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
