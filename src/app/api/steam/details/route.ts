import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { fetchSteamGameDetails, type SteamCacheEntry } from "@/lib/steam";

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
      if (Date.now() - data.cachedAt < CACHE_TTL_MS) {
        return NextResponse.json({ steamAppId, ...data });
      }
    }

    const fresh = await fetchSteamGameDetails(steamAppId);
    await setDoc(cacheRef, fresh);
    return NextResponse.json({ steamAppId, ...fresh });
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać danych ze Steam." }, { status: 502 });
  }
}
