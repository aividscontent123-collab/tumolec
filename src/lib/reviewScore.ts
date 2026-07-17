/** Progi pokrywają się z własną kategoryzacją opinii Steama (Mixed = 40-69%,
 * Positive+ = 70%+), żeby kolor był zgodny z intuicją graczy przyzwyczajonych
 * do Steama. `text-pass`/`text-rating` reużyte z istniejących tokenów (te
 * same kolory co reszta apki dla "źle"/"dobrze"); `text-rating-mid` to nowy
 * token tylko dla tego przypadku. */
export function reviewScoreColorClass(percent: number): string {
  if (percent < 40) return "text-pass";
  if (percent < 70) return "text-rating-mid";
  return "text-rating";
}
