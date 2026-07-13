"use client";

/** Siatka wzajemnie wykluczających się kafelków-przełączników (pojedynczy
 * wybór). Jeden współdzielony wzorzec dla filtrów w całej apce (backlog,
 * solo/multi, i kolejnych w Fazie B) -- podświetlone obramowanie + poświata
 * na aktywnym kafelku, zamiast stylować to osobno na każdym ekranie. */
export function ToggleChip<T extends string>({
  value,
  options,
  onChange,
  columns = 2,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={columns === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={
              active
                ? "border-accent-brand bg-card rounded-xl border-2 px-4 py-3 text-center text-sm font-semibold text-foreground"
                : "border-border bg-card rounded-xl border px-4 py-3 text-center text-sm font-semibold text-text-secondary"
            }
            style={active ? { boxShadow: `0 0 16px var(--accent-glow)` } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
