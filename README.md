# Tumolec

PWA do zbierania gier (dane ze Steama) i wyboru gry na wieczór metodą swipe + eliminacja rundowa, dla grupy 2-4 znajomych.

Pełny plan architektoniczny, model danych, roadmapa i uzasadnienia decyzji: `work/active/Tumolec.md` w vaulcie Obsidian (`C:\Users\miros\Desktop\RUFLO`).

## Stos

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui + Framer Motion + Firebase Firestore.

## Rozwój lokalny

```bash
npm install
npm run dev
```

Otwórz [http://localhost:3000](http://localhost:3000).

## Status

**Faza 0 — Fundamenty: gotowe.**

- [x] Szkielet Next.js + TypeScript + Tailwind + shadcn/ui
- [x] Design tokens (wariant 1a "Fiolet elektryczny") w `src/app/globals.css`
- [x] Pierwszy realny komponent: karta swipe (`src/components/swipe/SwipeCard.tsx`) z danymi demo
- [x] Projekt Firebase (`tumolec-d67d9`) + Firestore (`eur3`) + `firestore.rules` wdrożone
- [x] Repo GitHub: https://github.com/aividscontent123-collab/tumolec
- [x] Deploy Vercel: **https://tumolec.vercel.app**
- [ ] Auto-deploy przy pushu — trzeba dokończyć w dashboardzie Vercel (Import z GitHuba, `vercel.com/new`) — CLI `vercel git connect` nie przechodzi

Następny krok: Faza 1 (realna logika eliminacji rundowej + integracja Steam API). Zob. `work/active/Tumolec.md` w vaulcie.

## Bezpieczeństwo

- `.env.local` nigdy nie jest commitowany (w `.gitignore`)
- Klucz konfiguracyjny Firebase w kliencie jest publiczny z założenia — ochronę zapewnia `firestore.rules`, nie ukrywanie klucza
- Zob. sekcję "Bezpieczeństwo" w planie projektu po pełne uzasadnienie
