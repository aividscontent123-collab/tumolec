"use client";

/** Siatka wielokrotnego wyboru (gatunki) -- siostrzany komponent do
 * `ToggleChip` (pojedynczy wybór, backlog/multiplayer). Ten sam wizualny
 * wzorzec (podświetlone obramowanie + poświata), ale `value`/`onChange`
 * operują na tablicy zamiast pojedynczej wartości. */
export function MultiToggleChip<T extends string>({
  value,
  options,
  onChange,
  columns = 2,
}: {
  value: T[];
  options: { value: T; label: string }[];
  onChange: (value: T[]) => void;
  columns?: 2 | 3;
}) {
  function toggle(opt: T) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }

  return (
    <div className={columns === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
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
