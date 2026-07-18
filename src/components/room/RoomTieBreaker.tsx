"use client";

import { useMemo } from "react";
import { CoinFlip3D } from "@/components/coinflip/CoinFlip3D";
import { WheelCanvas } from "@/components/wheel/WheelCanvas";
import {
  finishRound,
  toggleTieBreakAgreement,
  triggerRoundTieBreak,
  type Participant,
  type RoundDoc,
} from "@/lib/rooms";
import type { SwipeGame } from "@/lib/types";

/** Widoczny tylko gdy `round.poolAtStart.length === 2` (wywołane z RoundVoting).
 * Trzy stany: (1) zbieranie zgód wszystkich uczestników, (2) wybór metody po
 * osiągnięciu zgody wszystkich, (3) animacja + odczyt wyniku. */
export function RoomTieBreaker({
  roomCode,
  roundId,
  participantId,
  participants,
  candidates,
  gameByAppId,
  tieBreak,
}: {
  roomCode: string;
  roundId: string;
  participantId: string;
  participants: Participant[];
  candidates: [number, number];
  gameByAppId: Map<number, SwipeGame>;
  tieBreak: RoundDoc["tieBreak"];
}) {
  const agreed = tieBreak?.agreedParticipantIds ?? [];
  const allAgreed =
    participants.length > 0 && participants.every((p) => agreed.includes(p.participantId));
  const iAgreed = agreed.includes(participantId);

  const gameA = gameByAppId.get(candidates[0]);
  const gameB = gameByAppId.get(candidates[1]);

  // Kosmetyczna liczba obrotów koła -- celowo NIE synchronizowana przez Firestore,
  // nie wpływa na to na którym segmencie koło się zatrzyma (patrz spec). Zależność
  // memo MUSI być prymitywem (millis), nie referencją obiektu Timestamp -- Firestore
  // deserializuje nowy obiekt Timestamp przy KAŻDYM snapshocie nawet gdy wartość się
  // nie zmieniła, więc referencja jako zależność przeliczałaby extraTurns (i resetowała
  // animację) przy każdej aktualizacji, nie tylko przy nowym triggerze.
  const triggeredAtMs = tieBreak?.triggeredAt?.toMillis() ?? null;
  const extraTurns = useMemo(() => 4 + Math.floor(Math.random() * 3), [triggeredAtMs]);

  if (!gameA || !gameB) return null;

  function handleResolved() {
    if (!tieBreak?.resultAppId) return;
    finishRound(roomCode, roundId, [tieBreak.resultAppId]);
  }

  if (tieBreak?.method === "coin") {
    return (
      <div className="flex flex-col items-center gap-3 py-3">
        <CoinFlip3D
          coinflip={{ result: tieBreak.resultAppId === candidates[0] ? "heads" : "tails", spinning: tieBreak.spinning, triggeredAt: tieBreak.triggeredAt }}
          headsLabel={gameA.title}
          tailsLabel={gameB.title}
          onFlipComplete={handleResolved}
        />
      </div>
    );
  }

  if (tieBreak?.method === "wheel") {
    return (
      <div className="flex flex-col items-center gap-3 py-3">
        <WheelCanvas
          wheel={{
            entries: [gameA.title, gameB.title],
            winner: tieBreak.resultAppId != null ? gameByAppId.get(tieBreak.resultAppId)?.title ?? null : null,
            spinning: tieBreak.spinning,
            extraTurns,
          }}
          onSpinAnimationComplete={handleResolved}
        />
      </div>
    );
  }

  if (allAgreed) {
    return (
      <div className="flex flex-col items-center gap-2 pb-3">
        <p className="text-text-secondary text-xs">Wszyscy się zgodzili — wybierzcie sposób:</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => triggerRoundTieBreak(roomCode, roundId, "coin", candidates)}
            className="bg-accent-brand rounded-full px-5 py-2 text-sm font-bold text-white"
          >
            Moneta
          </button>
          <button
            type="button"
            onClick={() => triggerRoundTieBreak(roomCode, roundId, "wheel", candidates)}
            className="bg-accent-brand rounded-full px-5 py-2 text-sm font-bold text-white"
          >
            Koło
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 pb-3">
      <p className="text-text-secondary text-xs">
        🎲 {agreed.length}/{participants.length} zgodziło się losować
      </p>
      <button
        type="button"
        onClick={() => toggleTieBreakAgreement(roomCode, roundId, participantId, !iAgreed)}
        className="border-border text-text-secondary rounded-full border px-5 py-2 text-sm"
      >
        {iAgreed ? "Wycofaj zgodę" : "Nie możecie się zdecydować? Zgadzam się losować"}
      </button>
    </div>
  );
}
