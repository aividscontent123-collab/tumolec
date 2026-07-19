/** Wyszukiwanie profili Steam po nazwie, bez logowania -- Steam wydaje
 * anonimowy sessionid (cookie CSRF) każdemu odwiedzającemu, nawet
 * niezalogowanemu. Zweryfikowane na żywo (2026-07-19): GET na
 * /search/users/ zwraca Set-Cookie: sessionid=...; ten sam sessionid
 * trzeba odesłać ZARÓWNO jako parametr zapytania, JAK I jako nagłówek
 * Cookie -- SearchCommunityAjax porównuje oba (CSRF double-submit), samo
 * query param bez cookie zwraca pustą odpowiedź ({} zamiast realnych
 * wyników). Bezstanowe: jedno dodatkowe zapytanie na wyszukiwanie, brak
 * potrzeby cache'owania cookie między requestami (pasuje do architektury
 * serverless Vercela). */

export type SteamProfileResult = {
  profileUrl: string;
  name: string;
  avatarUrl: string | null;
};

async function fetchSessionId(): Promise<string> {
  const res = await fetch("https://steamcommunity.com/search/users/", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/sessionid=([^;]+)/);
  if (!match) throw new Error("Nie udało się uzyskać sessionid ze Steam.");
  return match[1];
}

/** Czysta funkcja parsowania -- wzorem parseDiscoverResults w steam.ts.
 * Dzieli HTML na fragmenty per-wynik (każdy zaczyna się od
 * `<div class="search_row"`), wyciąga URL profilu + nazwę z anchor
 * `searchPersonaName` -- już gotowy do wklejenia w pole profilu (ten sam
 * format steamcommunity.com/id/... lub /profiles/... co /api/steam/library
 * już parsuje, zob. src/app/api/steam/library/route.ts) -- i awatar z
 * `avatarMedium`. Brak dopasowania nazwy = pomiń fragment (nie każdy blok
 * podzielony przez split() musi być realnym wynikiem, np. nagłówek paginacji
 * na początku odpowiedzi). */
export function parseCommunitySearchResults(html: string): SteamProfileResult[] {
  const chunks = html.split(/(?=<div class="search_row")/);
  const results: SteamProfileResult[] = [];
  for (const chunk of chunks) {
    const nameMatch = chunk.match(/class="searchPersonaName" href="([^"]+)">([^<]+)<\/a>/);
    if (!nameMatch) continue;
    const avatarMatch = chunk.match(/class="avatarMedium"[^>]*><a[^>]*><img src="([^"]+)"/);
    results.push({ profileUrl: nameMatch[1], name: nameMatch[2], avatarUrl: avatarMatch?.[1] ?? null });
  }
  return results;
}

export async function searchSteamProfiles(query: string): Promise<SteamProfileResult[]> {
  const sessionId = await fetchSessionId();
  const url = `https://steamcommunity.com/search/SearchCommunityAjax?text=${encodeURIComponent(query)}&filter=users&sessionid=${sessionId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://steamcommunity.com/search/users/",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: `sessionid=${sessionId}`,
    },
  });
  if (!res.ok) throw new Error(`SearchCommunityAjax failed: ${res.status}`);
  const data = (await res.json()) as { html?: string };
  return parseCommunitySearchResults(data.html ?? "");
}
