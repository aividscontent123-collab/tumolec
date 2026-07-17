# Home Restructure (Solo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the solo home screen's source-toggle-then-single-button flow with two equally-prominent, always-clickable "Eksploruj katalog" / "Eksploruj bibliotekę" buttons, so Explore is reachable in one click without picking a source first.

**Architecture:** Single-file, purely presentational refactor of `src/components/solo/SoloSettingsScreen.tsx`. `SoloHome.tsx`'s `handleLoadLibrary(source, profile, backlog, multiplayer)` already takes `source` as an explicit argument (not read from a toggle's state), so two buttons calling it with two different hardcoded `source` values requires zero changes downstream.

**Tech Stack:** Next.js 16, TypeScript, Tailwind.

## Global Constraints

- Zero changes outside `src/components/solo/SoloSettingsScreen.tsx`.
- `npm run build` must pass after the task (repo convention).
- No new npm dependencies.
- The `SOURCE_OPTIONS` constant and `source` state are removed entirely — not left as dead code.
- Backlog filter visibility condition changes from `source === "library"` to `profile.trim() !== ""`.
- "Eksploruj katalog" is always enabled (except while `loading`); "Eksploruj bibliotekę" is disabled until `profile.trim()` is non-empty (in addition to `loading`).

---

## Task 1: Two-button home screen

**Files:**
- Modify: `src/components/solo/SoloSettingsScreen.tsx`

**Interfaces:**
- Consumes: `onLoadLibrary(source: "library" | "catalog", profile: string, backlog: BacklogFilter, multiplayer: MultiplayerFilter) => void` — unchanged prop, already accepts explicit `source`.
- No change to any exported signature — `SoloSettingsScreen`'s own props (`onLoadLibrary`, `loading`, `error`) are untouched.

- [ ] **Step 1: Remove `SOURCE_OPTIONS` and the `source` state**

Remove this whole constant:
```tsx
const SOURCE_OPTIONS: { value: "library" | "catalog"; label: string }[] = [
  { value: "library", label: "Twoja biblioteka" },
  { value: "catalog", label: "Cały katalog Steam" },
];
```

Remove this line from the component body:
```tsx
  const [source, setSource] = useState<"library" | "catalog">("library");
```

- [ ] **Step 2: Update the subtitle**

Replace:
```tsx
        <p className="text-text-secondary mb-6 text-center text-sm">
          Przeglądaj gry kurzące się w twojej bibliotece: w prawo znaczy „zagram", w lewo „pomiń".
        </p>
```
with:
```tsx
        <p className="text-text-secondary mb-6 text-center text-sm">
          Wybierz jak chcesz przeglądać gry — z własnej biblioteki albo z całego katalogu Steam.
        </p>
```

- [ ] **Step 3: Remove the source toggle block**

Remove:
```tsx
        <div className="mb-5">
          <ToggleChip value={source} options={SOURCE_OPTIONS} onChange={setSource} columns={2} />
        </div>

```
(the blank line after it too — the profile field div follows directly).

- [ ] **Step 4: Simplify the profile field label**

Replace:
```tsx
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            Twój profil Steam {source === "catalog" && "(opcjonalnie)"}
          </span>
```
with:
```tsx
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">Twój profil Steam</span>
```

- [ ] **Step 5: Change the backlog filter's visibility condition**

Replace:
```tsx
        {source === "library" && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-foreground">Które gry pokazywać?</p>
            <ToggleChip value={backlog} options={BACKLOG_OPTIONS} onChange={setBacklog} columns={2} />
          </div>
        )}
```
with:
```tsx
        {profile.trim() !== "" && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-foreground">Które gry pokazywać?</p>
            <ToggleChip value={backlog} options={BACKLOG_OPTIONS} onChange={setBacklog} columns={2} />
          </div>
        )}
```

- [ ] **Step 6: Replace the single button with two side-by-side buttons**

Replace:
```tsx
        <button
          type="button"
          disabled={loading || (source === "library" && !profile.trim())}
          onClick={() => onLoadLibrary(source, profile.trim(), backlog, multiplayer)}
          className="bg-accent-brand mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
        >
          {loading ? "Wczytuję…" : source === "catalog" ? "Przeglądaj katalog" : "Wczytaj bibliotekę"}
        </button>
```
with:
```tsx
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => onLoadLibrary("catalog", profile.trim(), backlog, multiplayer)}
            className="bg-accent-brand rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
          >
            {loading ? "Wczytuję…" : "Eksploruj katalog"}
          </button>
          <button
            type="button"
            disabled={loading || !profile.trim()}
            onClick={() => onLoadLibrary("library", profile.trim(), backlog, multiplayer)}
            className="bg-accent-brand rounded-full py-3 text-sm font-bold text-white shadow-[0_8px_24px_var(--accent-brand-soft)] disabled:opacity-50"
          >
            {loading ? "Wczytuję…" : "Eksploruj bibliotekę"}
          </button>
        </div>
```

- [ ] **Step 7: Build to verify**

Run: `npm run build`
Expected: succeeds — no leftover references to `source`/`setSource`/`SOURCE_OPTIONS` anywhere in the file (`grep -n "SOURCE_OPTIONS\|setSource\|source ===" src/components/solo/SoloSettingsScreen.tsx` should return nothing).

- [ ] **Step 8: Manual verification**

Run `npm run dev`, open `http://localhost:3000`. Confirm: (1) both "Eksploruj katalog" and "Eksploruj bibliotekę" are visible immediately, no source picker above them; (2) "Eksploruj bibliotekę" is greyed out/disabled with an empty profile field; (3) "Eksploruj katalog" is clickable immediately and leads to the catalog Explore screen; (4) typing a profile enables "Eksploruj bibliotekę" and reveals the backlog filter ("Które gry pokazywać?"); (5) clicking "Eksploruj bibliotekę" with a valid profile loads the library Explore screen as before; (6) "Zapisane paczki gier" / "Stwórz pokój dla znajomych" / "Mam kod pokoju od znajomego" still work unchanged.

- [ ] **Step 9: Commit**

```bash
git add src/components/solo/SoloSettingsScreen.tsx
git commit -m "feat: restrukturyzacja strony glownej solo - dwa rownorzedne przyciski Eksploruj"
```

---

## Task 2: Full regression pass + deploy

**Files:** none (verification + deploy only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds with zero type errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all existing suites still pass (this task touches no pure-logic files, purely presentational — no new tests needed, none broken).

- [ ] **Step 3: Manual regression check of untouched flows**

Run `npm run dev`. Confirm unaffected: room flow (`/room/[code]/...` — lobby, pool, swipe, explore, versus, mini-games), solo catalog/library Explore (from 2026-07-16's Explore v2 work), genre filter bar, Polubione/Versus.

- [ ] **Step 4: Push to trigger Vercel auto-deploy**

```bash
git push origin master
```

- [ ] **Step 5: Verify the live deploy**

Poll `https://tumolec.vercel.app` until it responds `200` and reflects the new deploy (e.g. confirm via a distinguishing signal — the new two-button layout is client-rendered, so a raw `curl` of `/` won't show it directly since the page is `"use client"`; instead confirm the deploy timestamp/commit via `curl -s https://tumolec.vercel.app/_next/static/... ` is impractical — simplest reliable check: manually open the live URL in a browser (Playwright) and confirm the two-button layout renders, exactly as in Step 3/8 manual checks but against production instead of localhost).

- [ ] **Step 6: Update the vault**

After deploy is confirmed: update `work/active/Tumolec.md` roadmap and `work/active/Explore v2 — feedback do zaplanowania.md` (point 1 → done), per this vault's session-end convention.
