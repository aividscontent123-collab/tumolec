"use client";

import { useState } from "react";
import { computeSharedLibrary, matchesMultiplayerFilter } from "@/lib/steamLibrary";
import { hydrateAndAddGamesToPool, type Participant } from "@/lib/rooms";

export function SharedLibrarySection({
  roomCode,
  participantId,
  participants,
}: {
  roomCode: string;
  participantId: string;
  participants: Participant[];
}) {
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withLibrary = participants.filter((p) => (p.steamLibraryAppIds?.length ?? 0) > 0);
  if (withLibrary.length < 2) return null;

  const shared = computeSharedLibrary(participants);
  if (shared.length === 0) {
    return (
      <p className="text-text-secondary text-center text-xs">
        {withLibrary.length} uczestników podało bibliotekę, ale brak wspólnych gier.
      </p>
    );
  }

  async function handleAdd() {
    setAdding(true);
    setResult(null);
    setError(null);
    try {
      const added = await hydrateAndAddGamesToPool(roomCode, shared, participantId, (tags) =>
        matchesMultiplayerFilter(tags, "multi"),
      );
      setResult(`Dodano ${added} gier.`);
    } catch {
      setError("Nie udało się dodać gier. Spróbuj ponownie.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="bg-card border-border rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">
          Gry, które macie wspólnie ({shared.length})
        </span>
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="bg-accent-brand shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {adding ? "Dodaję…" : result ?? "Dodaj do puli"}
        </button>
      </div>
      {error && <p className="text-pass mt-2 text-sm">{error}</p>}
    </div>
  );
}
