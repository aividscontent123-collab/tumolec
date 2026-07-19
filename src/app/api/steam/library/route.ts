import { NextRequest, NextResponse } from "next/server";
import type { SteamOwnedGame } from "@/lib/steamLibrary";

const STEAMID64_RE = /^\d{17}$/;

/** Wyciąga vanity name albo steamid64 z dowolnej formy wejścia -- pełny URL,
 * sama nazwa, albo już gotowe steamid64. Ten sam kształt wejścia co dzisiejsze
 * pole wyszukiwania profilu (URL steamcommunity.com/id/... lub /profiles/...). */
function extractVanityOrId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/steamcommunity\.com\/(?:id|profiles)\/([^/?#]+)/i);
  return match ? match[1] : trimmed;
}

async function resolveSteamId64(vanityOrId: string, apiKey: string): Promise<string> {
  if (STEAMID64_RE.test(vanityOrId)) return vanityOrId;
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(vanityOrId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ResolveVanityURL failed: ${res.status}`);
  const data = (await res.json()) as { response: { success: number; steamid?: string } };
  if (data.response.success !== 1 || !data.response.steamid) {
    throw new Error("not-found");
  }
  return data.response.steamid;
}

type GetOwnedGamesRaw = { appid: number; name: string; playtime_forever: number };

/** Awatar to osobne wywołanie (GetOwnedGames go nie zwraca) -- best-effort,
 * brak awatara nigdy nie blokuje wczytania biblioteki, tylko degraduje UI
 * do awatara z pierwszą literą nicku (zob. ParticipantAvatarRow). */
async function fetchAvatarUrl(steamId64: string, apiKey: string): Promise<string | null> {
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId64}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { response: { players?: { avatarmedium?: string }[] } };
    return data.response.players?.[0]?.avatarmedium ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get("profile");
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Brak STEAM_API_KEY po stronie serwera." }, { status: 500 });
  }
  if (!input || !input.trim()) {
    return NextResponse.json({ error: "Podaj link do profilu Steam." }, { status: 400 });
  }

  let steamId64: string;
  try {
    steamId64 = await resolveSteamId64(extractVanityOrId(input), apiKey);
  } catch {
    return NextResponse.json({ error: "Nie znaleziono profilu Steam o tej nazwie." }, { status: 404 });
  }

  // Awatar ma OSOBNE ustawienie prywatności od biblioteki gier ("Szczegóły
  // gry") -- pobierany od razu po rozwiązaniu steamId64 i dołączany do KAŻDEJ
  // odpowiedzi (sukces i błąd) niżej, żeby prywatna/pusta biblioteka nie
  // gubiła awatara, który i tak jest publiczny.
  const avatarUrl = await fetchAvatarUrl(steamId64, apiKey);

  try {
    const ownedUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId64}&include_appinfo=1&include_played_free_games=1`;
    const ownedRes = await fetch(ownedUrl);
    if (!ownedRes.ok) {
      return NextResponse.json({ error: "Nie udało się pobrać biblioteki ze Steam.", avatarUrl }, { status: 502 });
    }
    const owned = (await ownedRes.json()) as {
      response: { game_count?: number; games?: GetOwnedGamesRaw[] };
    };
    if (!owned.response.game_count || !owned.response.games) {
      return NextResponse.json(
        {
          error:
            "Profil jest prywatny albo biblioteka jest pusta. Ustaw \"Szczegóły gry\" na publiczne w ustawieniach prywatności Steam.",
          avatarUrl,
        },
        { status: 404 },
      );
    }
    const games: SteamOwnedGame[] = owned.response.games.map((g) => ({
      steamAppId: g.appid,
      name: g.name,
      playtimeMinutes: g.playtime_forever,
    }));
    return NextResponse.json({ games, avatarUrl });
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać biblioteki ze Steam.", avatarUrl }, { status: 502 });
  }
}
