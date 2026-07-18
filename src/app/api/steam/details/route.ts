import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fetchSteamGameDetails, type SteamCacheEntry } from "@/lib/steam";
import { fetchHltbMainStory } from "@/lib/hltb";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni, zob. Tumolec.md

export async function GET(request: NextRequest) {
  const appidParam = request.nextUrl.searchParams.get("appid");
  const steamAppId = Number(appidParam);
  if (!appidParam || !Number.isInteger(steamAppId) || steamAppId <= 0) {
    return NextResponse.json({ error: "Podaj poprawny appid." }, { status: 400 });
  }

  const cacheRef = doc(db, "steam_cache", String(steamAppId));

  try {
    const cached = await getDoc(cacheRef);
    if (cached.exists()) {
      const data = cached.data() as SteamCacheEntry;
      // Wpisy sprzed dodania pola screenshots/trailerHlsUrl (commit 110bd72,
      // 2026-07-14) nie mają go wcale w dokumencie -- wiek sam w sobie nie
      // wystarczy, żeby uznać cache za kompletny. Wymuś refetch natychmiast
      // zamiast czekać do 30-dniowego TTL.
      const isFresh = Date.now() - data.cachedAt < CACHE_TTL_MS;
      const hasMediaFields = Object.prototype.hasOwnProperty.call(data, "screenshots");
      const hasHltbField = Object.prototype.hasOwnProperty.call(data, "hltbMainStory");
      if (isFresh && hasMediaFields && hasHltbField) {
        return NextResponse.json({ steamAppId, ...data });
      }
    }

    const fresh = await fetchSteamGameDetails(steamAppId);
    // Sekwencyjnie, nie równolegle: fetchHltbMainStory potrzebuje tytułu, który
    // dopiero co zwrócił fetchSteamGameDetails. HLTB nigdy nie rzuca (zob. hltb.ts),
    // więc błąd/brak wyniku tutaj nigdy nie blokuje zapisania danych Steama.
    const hltbMainStory = await fetchHltbMainStory(fresh.name);
    const withHltb: SteamCacheEntry = { ...fresh, hltbMainStory, hltbCachedAt: Date.now() };
    await setDoc(cacheRef, withHltb);
    return NextResponse.json({ steamAppId, ...withHltb });
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać danych ze Steam." }, { status: 502 });
  }
}
