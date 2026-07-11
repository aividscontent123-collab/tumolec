import { NextRequest, NextResponse } from "next/server";
import { searchSteamGames } from "@/lib/steam";

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get("q")?.trim();
  if (!term || term.length < 2 || term.length > 100) {
    return NextResponse.json({ error: "Podaj tytuł gry (2-100 znaków)." }, { status: 400 });
  }

  try {
    const results = await searchSteamGames(term);
    return NextResponse.json({ results: results.slice(0, 8) });
  } catch {
    return NextResponse.json({ error: "Nie udało się połączyć ze Steam." }, { status: 502 });
  }
}
