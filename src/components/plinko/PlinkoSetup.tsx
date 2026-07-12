"use client";

import { setPlinkoAssignments, type PlinkoState, type PoolGame } from "@/lib/rooms";
import { slotProbabilities } from "@/lib/plinko";

export function PlinkoSetup({
  roomCode,
  plinko,
  activeGames,
  onDrop,
}: {
  roomCode: string;
  plinko: PlinkoState;
  activeGames: PoolGame[];
  onDrop: () => void;
}) {
  const gameByAppId = new Map(activeGames.map((g) => [g.steamAppId, g]));
  // Tylko przypisania nadal obecne w aktywnej puli (gra mogła zostać usunięta).
  const order = plinko.assignments.filter((id) => gameByAppId.has(id));
  const probs = slotProbabilities(Math.max(2, order.length));

  function move(index: number, dir: -1 | 1) {
    const next = [...order];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setPlinkoAssignments(roomCode, next);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary text-xs">
        Kolejność = przypisanie do slotów. Środek listy trafia w środkowe sloty (większa szansa).
      </p>
      <ul className="flex flex-col gap-2">
        {order.map((id, i) => (
          <li
            key={id}
            className="bg-card border-border flex items-center gap-2 rounded-xl border px-4 py-2 text-sm text-foreground"
          >
            <span className="min-w-0 flex-1 truncate">{gameByAppId.get(id)?.title ?? "…"}</span>
            <span className="text-text-secondary shrink-0 text-xs">{Math.round(probs[i] * 100)}%</span>
            <button
              type="button"
              aria-label="W górę"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="text-text-secondary shrink-0 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="W dół"
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              className="text-text-secondary shrink-0 disabled:opacity-30"
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={order.length < 2 || plinko.dropping}
        onClick={onDrop}
        className="rounded-full py-3 text-sm font-bold text-white disabled:opacity-50"
        style={{ backgroundColor: "var(--accent-brand)", boxShadow: "0 8px 24px var(--accent-brand-soft)" }}
      >
        {plinko.dropping ? "Kulka leci…" : order.length < 2 ? "Dodaj co najmniej 2 gry" : "Zrzuć"}
      </button>
    </div>
  );
}
