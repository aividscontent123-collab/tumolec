"use client";

import { useEffect, useRef } from "react";
import Matter from "matter-js";

// ponytail: stałe fizyki (odstęp kołków, sprężystość, grawitacja) to knoby
// strojenia wizualnego -- dobierz na oko przy weryfikacji, model minimalny ich
// nie widzi. Upgrade path: fixed-step Engine.update jeśli sync wizualny okaże
// się za luźny (autorytatywny winnerSlot i tak chroni wybór gry).
const WIDTH = 320;
const PEG_GAP = 34;
const TOP = 44;
const RESTITUTION = 0.5;
const BALL_RADIUS = 7;

/** Plansza Plinko na Matter.js. Kulka spada z góry z małym, deterministycznym
 * odchyleniem wyliczonym z dropSeed. Gdy się zatrzyma u dołu, wylicza slot z
 * pozycji X i woła onSettled(slot). Wszyscy klienci renderują lokalnie; o wyborze
 * gry i tak decyduje autorytatywny winnerSlot publikowany przez wyzwalającego. */
export function PlinkoBoard({
  assignments,
  dropSeed,
  dropping,
  onSettled,
}: {
  assignments: number[];
  dropSeed: number | null;
  dropping: boolean;
  onSettled: (slot: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref, żeby zmiana identyczności onSettled nie restartowała symulacji.
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const slots = Math.max(2, assignments.length);
  const rows = slots - 1;
  const height = TOP + rows * PEG_GAP + 90;

  useEffect(() => {
    if (dropSeed == null || !dropping || !containerRef.current) return;
    const container = containerRef.current;
    let settled = false;

    const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;
    const engine = Engine.create();
    engine.gravity.y = 1;

    const render = Render.create({
      element: container,
      engine,
      options: { width: WIDTH, height, background: "transparent", wireframes: false },
    });

    // Kołki: trójkątny układ, N-1 rzędów; rząd r ma r+2 kołków.
    const pegs = [];
    for (let r = 0; r < rows; r++) {
      const count = r + 2;
      const rowWidth = (count - 1) * PEG_GAP;
      const startX = WIDTH / 2 - rowWidth / 2;
      const y = TOP + r * PEG_GAP;
      for (let c = 0; c < count; c++) {
        pegs.push(
          Bodies.circle(startX + c * PEG_GAP, y, 3, {
            isStatic: true,
            restitution: RESTITUTION,
            render: { fillStyle: "#6b7280" },
          }),
        );
      }
    }

    const walls = [
      Bodies.rectangle(0, height / 2, 4, height, { isStatic: true }),
      Bodies.rectangle(WIDTH, height / 2, 4, height, { isStatic: true }),
      Bodies.rectangle(WIDTH / 2, height, WIDTH, 4, { isStatic: true }),
    ];

    // Deterministyczne odchylenie startu z dropSeed -> różny tor przy każdym zrzucie.
    const jitter = ((dropSeed % 1000) / 1000 - 0.5) * PEG_GAP;
    const ball = Bodies.circle(WIDTH / 2 + jitter, 12, BALL_RADIUS, {
      restitution: RESTITUTION,
      friction: 0,
      render: { fillStyle: "#c2703d" },
    });

    Composite.add(engine.world, [...pegs, ...walls, ball]);

    const runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    const slotWidth = WIDTH / slots;
    const restingY = height - 90;
    Events.on(engine, "afterUpdate", () => {
      if (settled) return;
      if (ball.position.y >= restingY && Math.abs(ball.velocity.y) < 0.2) {
        settled = true;
        const slot = Math.min(slots - 1, Math.max(0, Math.floor(ball.position.x / slotWidth)));
        onSettledRef.current(slot);
      }
    });

    return () => {
      Render.stop(render);
      Runner.stop(runner);
      Events.off(engine, "afterUpdate");
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      render.canvas.remove();
    };
  }, [dropSeed, dropping, slots, rows, height]);

  return <div ref={containerRef} className="mx-auto" style={{ width: WIDTH, height }} />;
}
