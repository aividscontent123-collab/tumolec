/** Pass / like buttons below the swipe deck. Wiring to actual swipe state
 * lands in Faza 1 — for now these are presentational, matching the tap targets
 * from the design handoff exactly (60px pass / 68px like). */
export function SwipeActionButtons({
  onPass,
  onLike,
}: {
  onPass?: () => void;
  onLike?: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-7 pb-[30px]">
      <button
        type="button"
        onClick={onPass}
        aria-label="Pomiń"
        className="bg-card border-border text-pass flex h-[60px] w-[60px] items-center justify-center rounded-full border"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={onLike}
        aria-label="Chcę zagrać"
        className="bg-accent-brand flex h-[68px] w-[68px] items-center justify-center rounded-full shadow-[0_8px_24px_var(--accent-brand-soft)]"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
          <path d="M12 21s-7.5-4.6-10-9.1C.6 8.6 2.3 5 6 5c2 0 3.5 1 4.5 2.4C11.5 6 13 5 15 5c3.7 0 5.4 3.6 4 6.9C19.5 16.4 12 21 12 21z" />
        </svg>
      </button>
    </div>
  );
}
