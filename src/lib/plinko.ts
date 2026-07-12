/** Plinko: matematyka prawdopodobieństw slotów, bez zależności od Matter.js/UI.
 * Używana WYŁĄCZNIE do etykiet szansy na ekranie ustawienia -- realny wynik
 * zrzutu decyduje symulacja fizyki, nie ta funkcja. Szczegóły: work/active/Tumolec.md. */

/** Współczynnik dwumianowy C(n, k), liczony multiplikatywnie (bez silni). */
function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/** Dla N slotów plansza ma N-1 rzędów kołków. Szansa slotu k (0-indeksowany)
 * przy ~50/50 odbiciu to rozkład dwumianowy C(N-1, k) / 2^(N-1). */
export function slotProbabilities(n: number): number[] {
  const rows = n - 1;
  const total = 2 ** rows;
  return Array.from({ length: n }, (_, k) => binomial(rows, k) / total);
}
