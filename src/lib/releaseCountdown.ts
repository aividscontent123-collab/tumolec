/** Liczy dni do premiery z polskiej daty Steama (np. "17 lipca 2026",
 * dopełniacz miesiąca -- tak formatuje Steam appdetails przy l=polish).
 * Zwraca null gdy string nie pasuje do wzorca "D miesiąc RRRR" (Steam czasem
 * zwraca nieprecyzyjne daty typu "2026", "Q3 2026", "Wkrótce" dla gier bez
 * ustalonej daty -- panel wtedy pokazuje samą datę tekstową, bez liczby dni). */
const POLISH_MONTHS: Record<string, number> = {
  stycznia: 0,
  lutego: 1,
  marca: 2,
  kwietnia: 3,
  maja: 4,
  czerwca: 5,
  lipca: 6,
  sierpnia: 7,
  września: 8,
  października: 9,
  listopada: 10,
  grudnia: 11,
};

export function daysUntil(dateString: string, now: Date = new Date()): number | null {
  const match = dateString.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/u);
  if (!match) return null;
  const [, dayStr, monthName, yearStr] = match;
  const month = POLISH_MONTHS[monthName.toLowerCase()];
  if (month === undefined) return null;

  const day = Number(dayStr);
  const year = Number(yearStr);
  const releaseDate = new Date(Date.UTC(year, month, day));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const diffMs = releaseDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

const RECENT_RELEASE_WINDOW_DAYS = 60;
const UPCOMING_WINDOW_DAYS = 7;

/** "Nowości" -- gra już wydana (nie comingSoon) w ciągu ostatnich 60 dni.
 * Data nieparsowalna (np. "Q3 2026") liczy się jako niepasująca, nie błąd. */
export function isRecentRelease(
  releaseDate: { comingSoon: boolean; date: string } | null,
  now: Date = new Date(),
): boolean {
  if (!releaseDate || releaseDate.comingSoon) return false;
  const days = daysUntil(releaseDate.date, now);
  return days !== null && days >= -RECENT_RELEASE_WINDOW_DAYS && days <= 0;
}

/** "Wkrótce" -- gra jeszcze niewydana (comingSoon), premiera w ciągu 7 dni. */
export function isUpcomingSoon(
  releaseDate: { comingSoon: boolean; date: string } | null,
  now: Date = new Date(),
): boolean {
  if (!releaseDate || !releaseDate.comingSoon) return false;
  const days = daysUntil(releaseDate.date, now);
  return days !== null && days >= 0 && days <= UPCOMING_WINDOW_DAYS;
}
