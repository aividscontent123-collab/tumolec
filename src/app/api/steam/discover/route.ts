import { NextRequest, NextResponse } from "next/server";
import { fetchDiscoverPage, GENRE_TAG_IDS } from "@/lib/steam";

export async function GET(request: NextRequest) {
  const genresParam = request.nextUrl.searchParams.get("genres") ?? "";
  const startParam = request.nextUrl.searchParams.get("start") ?? "0";
  const start = Number(startParam);
  if (!Number.isInteger(start) || start < 0) {
    return NextResponse.json({ error: "Podaj poprawny start." }, { status: 400 });
  }

  const tagIds = genresParam
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => GENRE_TAG_IDS[g])
    .filter((id): id is number => id !== undefined);

  try {
    const page = await fetchDiscoverPage(tagIds, start);
    return NextResponse.json(page);
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać katalogu ze Steam." }, { status: 502 });
  }
}
