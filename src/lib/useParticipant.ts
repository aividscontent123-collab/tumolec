"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Tożsamość uczestnika per-pokój, trzymana w localStorage -- bez logowania,
 * zgodnie z modelem "link + pseudonim" z work/active/Tumolec.md.
 * `useSyncExternalStore` zamiast useState+useEffect, żeby czytanie
 * localStorage nie było hydration-mismatchem ani "setState w efekcie". */
export function useParticipant(roomCode: string) {
  const participantId = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(`tumolec:${roomCode}:participantId`),
    () => null,
  );
  const nickname = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(`tumolec:${roomCode}:nickname`),
    () => null,
  );

  function save(id: string, name: string) {
    localStorage.setItem(`tumolec:${roomCode}:participantId`, id);
    localStorage.setItem(`tumolec:${roomCode}:nickname`, name);
    window.dispatchEvent(new StorageEvent("storage"));
  }

  return { participantId, nickname, save };
}
