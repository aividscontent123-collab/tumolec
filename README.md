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

**Fazy 0–4: gotowe i wdrożone.**

- [x] Szkielet Next.js + TypeScript + Tailwind + shadcn/ui
- [x] Design tokens (wariant 1a "Fiolet elektryczny") w `src/app/globals.css`
- [x] Pula gier, swipe + eliminacja rundowa, ekran wyniku
- [x] Rzut monetą (`/room/[code]/coinflip`), koło fortuny (`/room/[code]/wheel`)
- [x] Redesign, tryb jasny/ciemny, PWA
- [x] Przegląd bezpieczeństwa `firestore.rules` zamknięty i wdrożony
- [x] Projekt Firebase (`tumolec-d67d9`) + Firestore (`eur3`)
- [x] Repo GitHub (publiczne): https://github.com/aividscontent123-collab/tumolec
- [x] Deploy Vercel: **https://tumolec.vercel.app**
- [x] Auto-deploy przy pushu podłączony

Następny krok: Faza 5 (backlog — historia sesji, statystyki grupy, import biblioteki Steam). Zob. `work/active/Tumolec.md` w vaulcie.

## Bezpieczeństwo

- `.env.local` nigdy nie jest commitowany (w `.gitignore`)
- Klucz konfiguracyjny Firebase w kliencie jest publiczny z założenia — ochronę zapewnia `firestore.rules`, nie ukrywanie klucza
- Zob. sekcję "Bezpieczeństwo" w planie projektu po pełne uzasadnienie
