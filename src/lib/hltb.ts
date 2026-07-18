/** Wywołania nieoficjalnego pakietu npm `howlongtobeat`. Tylko server-side --
 * pakiet zależy od cheerio/axios (scraping HTML), nigdy nie trafia do bundla
 * klienta. HLTB, w przeciwieństwie do Steama, nie ma stabilnego publicznego
 * endpointu (bezpośrednie uderzenie w /api/search dało 404, strona haszuje
 * chunki JS) -- stąd gotowy, utrzymywany pakiet zamiast własnego scrapera.
 * Uzasadnienie: docs/superpowers/specs/2026-07-18-hltb-main-story-badge-design.md */
import { HowLongToBeatService, type HowLongToBeatEntry } from "howlongtobeat";

/** Czysta funkcja wyboru -- testowalna bez sieci, wzorzec jak
 * parseSteamAppDetails w steam.ts. UWAGA: search() pakietu NIE sortuje po
 * trafności -- każdy wynik niesie własne pole `similarity` (Levenshtein),
 * trzeba samemu wybrać najlepszy, nie brać results[0]. */
export function pickMainStoryHours(results: HowLongToBeatEntry[]): number | null {
  if (results.length === 0) return null;
  const best = results.reduce((a, b) => (b.similarity > a.similarity ? b : a));
  if (!best.gameplayMain || best.gameplayMain <= 0) return null;
  return Math.round(best.gameplayMain);
}

/** Nigdy nie rzuca -- błąd sieci/parsowania degraduje do null, tak samo jak
 * brak wyników. Wołane z /api/steam/details, nigdy nie blokuje zapisania
 * świeżych danych Steama. */
export async function fetchHltbMainStory(title: string): Promise<number | null> {
  try {
    const service = new HowLongToBeatService();
    const results = await service.search(title);
    return pickMainStoryHours(results);
  } catch {
    return null;
  }
}
