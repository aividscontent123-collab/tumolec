# UX Backlog Group 3 (B3 + A3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two backlog items that required live recon before design (B3, A3), now that the recon is done.

**Recon findings (done today, 2026-07-19, live against real Steam endpoints — see task briefs for exact evidence):**
- **B3** ("Popularne" tag idea): Steam's `appdetails` response includes a `type` field (`"game"` vs `"dlc"`, confirmed live: appid 304212 "Euro Truck Simulator 2 - Scandinavia" returns `type: "dlc"`; appid 730 "Counter-Strike 2" returns `type: "game"`). This is a clean, reliable signal to exclude DLC (and other non-game types) from browsing entirely — **this plan does that**. Separately, Steam's search-results endpoint has no distinct "popularity" sort — the default (`sort_by=_ASC`, labeled "Trafność"/Relevance in the UI) is already the closest thing to it, so **no new "Popularne" pill is added** (there is nothing different for it to switch to; it would be a no-op control). Also found during recon: unreleased ("coming soon") titles can appear in default browsing today even when the user hasn't selected the "Nowości"/"Wkrótce" pills — the existing date-filter code only checks `releaseDate` when one of those pills IS selected, never excludes by default. **This plan fixes that too**, since it's the second half of the same user complaint ("łatwo trafić... na same DLC albo same niewydane jeszcze tytuły").
- **A3** (Steam profile search by name): confirmed live today that `GET https://steamcommunity.com/search/users/` returns a `Set-Cookie: sessionid=...` to an anonymous request, and `GET https://steamcommunity.com/search/SearchCommunityAjax?text=<query>&filter=users&sessionid=<token>` returns real results **only when that same sessionid is sent both as the query param AND as a `Cookie: sessionid=...` header** (a CSRF double-submit check — sending it as a query param alone, without the cookie, returns an empty `{}`). Verified with `text=gaben`: 70,737 results, 20 parsed per page. The actual per-result HTML structure differs slightly from the original spec's assumption — the profile URL is directly available in the `<a class="searchPersonaName" href="...">` anchor (either `steamcommunity.com/profiles/<id64>` or `steamcommunity.com/id/<vanity>` — both formats the existing `/api/steam/library` route already parses), so **no `data-miniprofile`-to-URL conversion is needed** — just extract the anchor's `href` and text, plus the avatar `<img src>` from the adjacent `avatarMedium` div.

## Global Constraints

- No new npm dependencies (regex parsing only, matching the existing `parseDiscoverResults` pattern — no cheerio/jsdom).
- Source spec: `docs/superpowers/specs/2026-07-18-ux-feedback-backlog-design.md` sections B3, A3. Where this plan's recon corrects or narrows the spec's original assumptions, this plan's text (above) is authoritative.
- Full source doc (project roadmap/context): `work/active/Tumolec.md` in the Obsidian vault at `C:\Users\miros\Desktop\RUFLO`.

---

### Task 1: Exclude non-game types (DLC/demos) and unreleased titles from default browsing (item B3)

**Files:**
- Modify: `src/lib/steam.ts`
- Modify: `src/components/solo/SoloSwipeScreen.tsx`
- Modify: `src/components/room/RoomExploreScreen.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fetchSteamGameDetails` now throws for non-"game" `type` values, which every existing caller (`/api/steam/details/route.ts`) already converts into `{ error: "..." }` — every consumer (`SoloSwipeScreen.tsx`, `RoomExploreScreen.tsx`, `AddGameForm.tsx`, `SoloLikedScreen.tsx`, `LocalVersusScreen.tsx`) already treats an error response as "skip this candidate" (`if (!res.ok || data.error) continue;` or equivalent), so no other file needs to change to benefit from this.

- [ ] **Step 1: Reject non-"game" appdetails responses in `fetchSteamGameDetails`**

In `src/lib/steam.ts`, add a `type` field to `RawAppDetailsData` (currently lines 75-86):

```typescript
type RawAppDetailsData = {
  name: string;
  type?: string;
  header_image: string;
  short_description: string;
  genres?: { description: string }[];
  categories?: { description: string }[];
  pc_requirements?: { minimum?: string; recommended?: string } | [];
  developers?: string[];
  release_date?: { coming_soon: boolean; date: string };
  screenshots?: { id: number; path_thumbnail: string; path_full: string }[];
  movies?: { id: number; name: string; thumbnail: string; hls_h264?: string; highlight?: boolean }[];
};
```

Change `fetchSteamGameDetails` (currently lines 158-174) from:

```typescript
export async function fetchSteamGameDetails(steamAppId: number): Promise<SteamCacheEntry> {
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=polish`;
  const reviewsUrl = `https://store.steampowered.com/appreviews/${steamAppId}?json=1&language=polish&purchase_type=all&num_per_page=10`;

  const [detailsRes, reviewsRes] = await Promise.all([fetch(detailsUrl), fetch(reviewsUrl)]);
  if (!detailsRes.ok) throw new Error(`appdetails failed: ${detailsRes.status}`);
  if (!reviewsRes.ok) throw new Error(`appreviews failed: ${reviewsRes.status}`);

  const details = (await detailsRes.json()) as AppDetailsResponse;
  const entry = details[String(steamAppId)];
  if (!entry?.success || !entry.data) {
    throw new Error(`Steam nie zwrócił danych dla appid ${steamAppId}`);
  }
  const reviews = (await reviewsRes.json()) as AppReviewsResponse;

  return parseSteamAppDetails(steamAppId, entry.data, reviews);
}
```

to:

```typescript
export async function fetchSteamGameDetails(steamAppId: number): Promise<SteamCacheEntry> {
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}&l=polish`;
  const reviewsUrl = `https://store.steampowered.com/appreviews/${steamAppId}?json=1&language=polish&purchase_type=all&num_per_page=10`;

  const [detailsRes, reviewsRes] = await Promise.all([fetch(detailsUrl), fetch(reviewsUrl)]);
  if (!detailsRes.ok) throw new Error(`appdetails failed: ${detailsRes.status}`);
  if (!reviewsRes.ok) throw new Error(`appreviews failed: ${reviewsRes.status}`);

  const details = (await detailsRes.json()) as AppDetailsResponse;
  const entry = details[String(steamAppId)];
  if (!entry?.success || !entry.data) {
    throw new Error(`Steam nie zwrócił danych dla appid ${steamAppId}`);
  }
  // DLC/demo/soundtrack itp. mają `type` inny niż "game" -- appdetails
  // niesie ten sygnał wprost (zweryfikowane na żywo: appid 304212 "Euro
  // Truck Simulator 2 - Scandinavia" zwraca type=dlc). Odrzucenie tutaj,
  // w jedynym miejscu wołanym przez WSZYSTKICH konsumentów (przeglądanie
  // solo/pokój, ręczne dodawanie), jest równoznaczne z pominięciem takiego
  // kandydata wszędzie -- każdy istniejący wołający już traktuje rzucony
  // tu błąd jako "pomiń i idź dalej".
  if (entry.data.type && entry.data.type !== "game") {
    throw new Error(`Appid ${steamAppId} to nie gra (type=${entry.data.type}).`);
  }
  const reviews = (await reviewsRes.json()) as AppReviewsResponse;

  return parseSteamAppDetails(steamAppId, entry.data, reviews);
}
```

Note: `fetchSteamGameDetails` makes real network calls and has no existing unit test (only the pure `parseSteamAppDetails` is unit tested in this codebase — see `src/lib/steam.test.ts`) — this matches that existing boundary, no new test needed for this step.

- [ ] **Step 2: Exclude unreleased ("coming soon") titles from default browsing in `SoloSwipeScreen.tsx`**

In `src/components/solo/SoloSwipeScreen.tsx`, change (currently lines 95-101):

```typescript
        const wantsNew = genreFilter.includes(NEW_RELEASE_TAG);
        const wantsSoon = genreFilter.includes(UPCOMING_TAG);
        if (wantsNew || wantsSoon) {
          const matchesDate =
            (wantsNew && isRecentRelease(data.releaseDate)) || (wantsSoon && isUpcomingSoon(data.releaseDate));
          if (!matchesDate) continue;
        }
```

to:

```typescript
        const wantsNew = genreFilter.includes(NEW_RELEASE_TAG);
        const wantsSoon = genreFilter.includes(UPCOMING_TAG);
        if (wantsNew || wantsSoon) {
          const matchesDate =
            (wantsNew && isRecentRelease(data.releaseDate)) || (wantsSoon && isUpcomingSoon(data.releaseDate));
          if (!matchesDate) continue;
        } else if (data.releaseDate?.comingSoon) {
          // Domyślne przeglądanie (bez wybranego Nowości/Wkrótce) nie ma
          // pokazywać niewydanych jeszcze tytułów -- to opt-in przez te
          // pigułki, nie coś co ma wpadać przypadkiem.
          continue;
        }
```

- [ ] **Step 3: Apply the identical change to `RoomExploreScreen.tsx`**

In `src/components/room/RoomExploreScreen.tsx`, change (currently lines 158-164):

```typescript
        const wantsNew = genres.includes(NEW_RELEASE_TAG);
        const wantsSoon = genres.includes(UPCOMING_TAG);
        if (wantsNew || wantsSoon) {
          const matchesDate =
            (wantsNew && isRecentRelease(data.releaseDate)) || (wantsSoon && isUpcomingSoon(data.releaseDate));
          if (!matchesDate) continue;
        }
```

to:

```typescript
        const wantsNew = genres.includes(NEW_RELEASE_TAG);
        const wantsSoon = genres.includes(UPCOMING_TAG);
        if (wantsNew || wantsSoon) {
          const matchesDate =
            (wantsNew && isRecentRelease(data.releaseDate)) || (wantsSoon && isUpcomingSoon(data.releaseDate));
          if (!matchesDate) continue;
        } else if (data.releaseDate?.comingSoon) {
          continue;
        }
```

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Run the full test suite (regression check)**

Run: `npm test`
Expected: PASS — this change adds an optional field to a type and two `else if` branches; no existing test constructs a `RawAppDetailsData` with `type` set, so all existing `parseSteamAppDetails` tests are unaffected (the field is optional and untouched by that function).

- [ ] **Step 6: Manual verification with Playwright**

Start the dev server. Confirm:
- (a) Browsing the catalog (solo "Eksploruj katalog", or a room's "Eksploruj" catalog source) with no filters selected no longer surfaces DLC/expansion-pack cards (spot check: browse for a while, confirm no card title looks like a DLC — e.g. nothing matching patterns like "<Game> - <Expansion Name>" that you can cross-check against the Steam store as being type=dlc) and no unreleased ("Zapowiedź"/coming-soon) titles appear.
- (b) Selecting the "Wkrótce" pill still correctly shows upcoming titles (this path is unchanged — only the *default*, no-pill-selected path gained an exclusion).
- (c) Manually searching for and trying to add a known DLC (e.g. search "Euro Truck Simulator 2" then try to pick the "Scandinavia" DLC result if it appears in `/api/steam/search` results) via `AddGameForm` in a room's pool now fails gracefully with the existing "Nie udało się dodać gry" error, instead of silently adding an unplayable DLC entry to the pool.

- [ ] **Step 7: Commit**

```bash
git add src/lib/steam.ts src/components/solo/SoloSwipeScreen.tsx src/components/room/RoomExploreScreen.tsx
git commit -m "fix: exclude DLC/non-game types and unreleased titles from default browsing"
```

---

### Task 2: Steam profile search by name, without login (item A3)

**Files:**
- Create: `src/lib/steamCommunitySearch.ts`
- Create: `src/lib/steamCommunitySearch.test.ts`
- Create: `src/app/api/steam/find-profile/route.ts`
- Modify: `src/components/solo/SoloSettingsScreen.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `SteamProfileResult = { profileUrl: string; name: string; avatarUrl: string | null }`, `parseCommunitySearchResults(html: string): SteamProfileResult[]`, `searchSteamProfiles(query: string): Promise<SteamProfileResult[]>` — all from the new `src/lib/steamCommunitySearch.ts`. The API route returns `{ results: SteamProfileResult[] }` or `{ error: string }`, mirroring the exact shape of the existing `/api/steam/search` route.

- [ ] **Step 1: Write the failing test for `parseCommunitySearchResults`**

Create `src/lib/steamCommunitySearch.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseCommunitySearchResults } from "./steamCommunitySearch";

describe("parseCommunitySearchResults", () => {
  it("parses profile URL, name, and avatar from a real SearchCommunityAjax HTML fragment", () => {
    const html = `
						<div class="search_row" data-panel="{&quot;clickOnActivate&quot;:&quot;firstChild&quot;}" role="button" >
	<div class="mediumHolder_default" data-miniprofile="43147274" style="float:left;"><div class="avatarMedium"><a href="https://steamcommunity.com/profiles/76561198003413002"><img src="https://avatars.fastly.steamstatic.com/bd2fa2520c831f4f81779645e2a6c307666f6095_medium.jpg"></a></div></div>
	<div class="searchPersonaInfo">
		<a class="searchPersonaName" href="https://steamcommunity.com/profiles/76561198003413002">Decks</a><br />
					Dexter<br />			Honolulu, Hawaii, United States&nbsp;<img style="margin-bottom:-2px" src="https://community.fastly.steamstatic.com/public/images/countryflags/us.gif" border="0" />			</div>
	<div class="search_result_friend">
			</div>
	<div style="clear:right"></div>
		<div style="clear:both"></div>

			</div>
								<div class="search_row" data-panel="{&quot;clickOnActivate&quot;:&quot;firstChild&quot;}" role="button" >
	<div class="mediumHolder_default" data-miniprofile="109615539" style="float:left;"><div class="avatarMedium"><a href="https://steamcommunity.com/id/gabene55"><img src="https://avatars.fastly.steamstatic.com/0ae81ca7c6209a3391ea86d2da7ff019658732e0_medium.jpg"></a></div></div>
	<div class="searchPersonaInfo">
		<a class="searchPersonaName" href="https://steamcommunity.com/id/gabene55">Gabene</a><br />
								Distrito Federal, Mexico&nbsp;<img style="margin-bottom:-2px" src="https://community.fastly.steamstatic.com/public/images/countryflags/mx.gif" border="0" />			</div>
	<div class="search_result_friend">
			</div>
	<div style="clear:right"></div>
		<div style="clear:both"></div>

				<div class="search_match_info">
										<div>Custom URL: steamcommunity.com/id/<span style="color: whitesmoke">gabene55</span></div>
								</div>
		</div>`;

    const result = parseCommunitySearchResults(html);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      profileUrl: "https://steamcommunity.com/profiles/76561198003413002",
      name: "Decks",
      avatarUrl: "https://avatars.fastly.steamstatic.com/bd2fa2520c831f4f81779645e2a6c307666f6095_medium.jpg",
    });
    expect(result[1]).toEqual({
      profileUrl: "https://steamcommunity.com/id/gabene55",
      name: "Gabene",
      avatarUrl: "https://avatars.fastly.steamstatic.com/0ae81ca7c6209a3391ea86d2da7ff019658732e0_medium.jpg",
    });
  });

  it("returns an empty array for HTML with no result rows", () => {
    expect(parseCommunitySearchResults("<div>no results</div>")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- steamCommunitySearch.test.ts`
Expected: FAIL — `steamCommunitySearch.ts` doesn't exist yet, so the import fails.

- [ ] **Step 3: Create `src/lib/steamCommunitySearch.ts` with the parsing function and the two-step fetch**

Create `src/lib/steamCommunitySearch.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- steamCommunitySearch.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Create the API route**

Create `src/app/api/steam/find-profile/route.ts`:

```typescript
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
```

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors, new route appears in the build output's route list.

- [ ] **Step 7: Wire the debounced search into `SoloSettingsScreen.tsx`'s profile field**

In `src/components/solo/SoloSettingsScreen.tsx`, change the imports (currently lines 1-8) from:

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { roomExists, createRoom, joinRoom } from "@/lib/rooms";
import { type BacklogFilter } from "@/lib/steamLibrary";
```

to:

```typescript
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { roomExists, createRoom, joinRoom } from "@/lib/rooms";
import { type BacklogFilter } from "@/lib/steamLibrary";
import type { SteamProfileResult } from "@/lib/steamCommunitySearch";
```

Add two new state variables and a debounce effect + selection handler right after the existing state declarations (currently ending at line 37 with `const [createError, setCreateError] = useState<string | null>(null);`):

```typescript
  const [createError, setCreateError] = useState<string | null>(null);
  const [profileResults, setProfileResults] = useState<SteamProfileResult[]>([]);
  const [profileSearching, setProfileSearching] = useState(false);

  useEffect(() => {
    const trimmed = profile.trim();
    // Nie szukaj, gdy user już wkleił pełny link -- wyszukiwarka jest tylko
    // dla wpisywania nazwy, wklejony link idzie bezpośrednio do onLoadLibrary.
    if (trimmed.length < 2 || trimmed.includes("steamcommunity.com")) {
      setProfileResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setProfileSearching(true);
      try {
        const res = await fetch(`/api/steam/find-profile?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setProfileResults(res.ok ? data.results : []);
      } catch {
        setProfileResults([]);
      } finally {
        setProfileSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [profile]);

  function selectProfile(result: SteamProfileResult) {
    setProfile(result.profileUrl);
    setProfileResults([]);
  }
```

Change the profile input block (currently lines 114-123) from:

```typescript
            <span className="text-sm font-semibold text-foreground">Twój profil Steam</span>
            <input
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder="https://steamcommunity.com/id/..."
              className="bg-card border-border rounded-xl border px-4 py-3 text-foreground"
            />
            <p className="text-text-secondary text-xs">
              Wklej link do profilu (steamcommunity.com/id/... lub /profiles/...) albo własną nazwę URL.
            </p>
```

to:

```typescript
            <span className="text-sm font-semibold text-foreground">Twój profil Steam</span>
            <div className="relative">
              <input
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="Szukaj po nazwie…"
                className="bg-card border-border w-full rounded-xl border px-4 py-3 text-foreground"
              />
              {(profileResults.length > 0 || profileSearching) && (
                <div className="bg-popover border-border absolute top-full right-0 left-0 z-10 mt-2 max-h-80 overflow-y-auto rounded-xl border">
                  {profileSearching && <p className="text-text-secondary p-3 text-sm">Szukam…</p>}
                  {profileResults.map((r) => (
                    <button
                      key={r.profileUrl}
                      type="button"
                      onClick={() => selectProfile(r)}
                      className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/5"
                    >
                      {r.avatarUrl && (
                        <Image
                          src={r.avatarUrl}
                          alt=""
                          width={32}
                          height={32}
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      )}
                      <span className="text-sm text-foreground">{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-text-secondary text-xs">
              Albo wklej link bezpośrednio (steamcommunity.com/id/... lub /profiles/...).
            </p>
```

Note: `onLoadLibrary`, the backlog `ToggleChip`, and the "Wczytaj bibliotekę" submit button right after this block are all unchanged — `profile` is still the same state variable, just now populated either by typing+selecting a search result or by pasting a link directly, exactly as before.

- [ ] **Step 8: Add the Next.js remote image pattern for Steam avatar CDN, if not already covered**

Check `next.config.ts` for an existing `images.remotePatterns` entry covering `avatars.fastly.steamstatic.com` (the existing codebase already loads images from `steamstatic.com`/`fastly.steamstatic.com` domains for game covers/screenshots, so this domain is very likely already allowed — a wildcard like `*.steamstatic.com` would already cover `avatars.fastly.steamstatic.com`). If the exact hostname is not covered by any existing pattern, add it following the same shape as the existing entries in that file. If it's already covered, this step is a no-op — just confirm and move on, don't add a duplicate/redundant entry.

- [ ] **Step 9: Run the build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors, no `next/image` "hostname not configured" runtime error (this specifically needs live verification in Step 10, since the build itself won't catch a missing remote pattern — that only surfaces when an actual `<Image>` with that hostname renders).

- [ ] **Step 10: Manual verification with Playwright**

Start the dev server, navigate to `/`, click "Eksploruj bibliotekę" to reveal the profile field. Confirm:
- (a) Typing a name (e.g. "gaben", at least 2 characters) shows a "Szukam…" loading state after ~300ms, then a dropdown of real Steam profiles with avatar + display name.
- (b) Clicking a result fills the input with that profile's URL and closes the dropdown; the "Które gry pokazywać?" backlog toggle and "Wczytaj bibliotekę" button behave exactly as before (unaffected by this task — same `profile` state, just populated differently).
- (c) Pasting a full `steamcommunity.com/id/...` or `/profiles/...` URL directly still works and does NOT trigger the search dropdown (the `trimmed.includes("steamcommunity.com")` guard suppresses it).
- (d) No console errors about unconfigured image hostnames when an avatar renders.

- [ ] **Step 11: Commit**

```bash
git add src/lib/steamCommunitySearch.ts src/lib/steamCommunitySearch.test.ts src/app/api/steam/find-profile/route.ts src/components/solo/SoloSettingsScreen.tsx
git commit -m "feat: search Steam profiles by name without login"
```

---

## Self-Review Notes

- **Spec coverage:** B3 (§B3) → Task 1, narrowed by live recon to (a) exclude non-game types and (b) exclude unreleased titles by default; explicitly does NOT add a "Popularne" pill since recon found nothing distinct for it to do. A3 (§A3) → Task 2, using the corrected (recon-verified today, not just on 2026-07-18) HTML structure and cookie-handling requirement. This plan covers everything in "Priorytet wykonania" tier 3 of the spec.
- **Placeholder scan:** none found — every step has concrete code, including the actual live-captured HTML fixture for the parser test (Task 2, Step 1).
- **Type consistency:** `SteamProfileResult` shape (`profileUrl`, `name`, `avatarUrl`) is identical between `steamCommunitySearch.ts`'s export, the API route's pass-through, and `SoloSettingsScreen.tsx`'s consumption (`r.profileUrl`, `r.name`, `r.avatarUrl`).
- **Deviation from spec flagged for the implementer/reviewer:** the spec (§A3) suggested extracting `data-miniprofile` and converting it to a usable profile reference; live recon (this plan) found the `searchPersonaName` anchor's `href` already contains a directly-usable profile URL, avoiding that conversion step entirely — simpler than the spec assumed, not more complex, so no functionality is lost.
