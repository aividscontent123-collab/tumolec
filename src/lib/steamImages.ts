/** URL-e assetów graficznych Steam liczone z appid (bez wywołań sieciowych/cache).
 * Host cdn.akamai.steamstatic.com jest już dozwolony w next.config.ts remotePatterns. */

/** Natywnie pionowy asset "library" (1200×1800) — pasuje do wysokiej karty swipe
 * bez rozciągania poziomego header.jpg. Nie każdy appid go ma; wołający musi
 * obsłużyć 404 fallbackiem do poziomego headera (patrz SwipeCard). */
export function steamLibraryPortraitUrl(steamAppId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/library_600x900_2x.jpg`;
}
