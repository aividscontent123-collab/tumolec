export const SWIPE_DISTANCE_THRESHOLD = 120;
export const SWIPE_VELOCITY_THRESHOLD = 0.5;

/** Decyduje, czy przeciągnięcie karty liczy się jako fling i w którą stronę --
 * dystans LUB prędkość puszczenia wystarczą osobno, żeby krótkie szybkie
 * machnięcie działało tak samo jak wolne dalekie przeciągnięcie. Czysta
 * funkcja, żeby dało się to przetestować bez mockowania gestów w DOM. */
export function decideSwipeDirection(offsetX: number, velocityX: number): "left" | "right" | null {
  const flung = Math.abs(offsetX) > SWIPE_DISTANCE_THRESHOLD || velocityX > SWIPE_VELOCITY_THRESHOLD;
  if (!flung) return null;
  return offsetX >= 0 ? "right" : "left";
}
