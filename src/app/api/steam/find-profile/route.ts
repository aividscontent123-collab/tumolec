import { NextRequest, NextResponse } from "next/server";
import { searchSteamProfiles } from "@/lib/steamCommunitySearch";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2 || query.length > 50) {
    return NextResponse.json({ error: "Podaj nazwę (2-50 znaków)." }, { status: 400 });
  }

  try {
    const results = await searchSteamProfiles(query);
    return NextResponse.json({ results: results.slice(0, 8) });
  } catch {
    // Nieoficjalny mechanizm (jak reszta integracji Steama w tym projekcie,
    // np. Discover) -- jeśli Steam zmieni HTML strony wyszukiwania i regex
    // przestanie parsować, to miejsce po prostu zwraca błąd zamiast wywalać
    // całą apkę; UI reaguje pustą listą wyników, tak jak przy braku
    // dopasowań.
    return NextResponse.json({ error: "Nie udało się połączyć ze Steam." }, { status: 502 });
  }
}
