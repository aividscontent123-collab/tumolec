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

**Faza 0 — Fundamenty: w toku.**

- [x] Szkielet Next.js + TypeScript + Tailwind + shadcn/ui
- [x] Design tokens (wariant 1a "Fiolet elektryczny") w `src/app/globals.css`
- [x] Pierwszy realny komponent: karta swipe (`src/components/swipe/SwipeCard.tsx`) z danymi demo
- [x] Szkic `firestore.rules` (do wdrożenia po utworzeniu projektu Firebase)
- [ ] Projekt Firebase + Firestore — **wymaga Twojego konta Google**, zob. niżej
- [ ] Repo na GitHubie — **wymaga Twojego konta**, zob. niżej
- [ ] Deploy na Vercel — **wymaga Twojego konta**, zob. niżej

## Kroki wymagające Twojego konta (jednorazowo)

Te trzy rzeczy nie mogą zostać zrobione automatycznie — wymagają logowania do Twoich kont. Wykonaj kiedy będziesz gotów, potem daj mi znać i dokończę wpięcie.

**1. Firebase (baza danych)**
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # w katalogu tumolec, wybierz "Use an existing project" -> utwórz nowy w konsoli jeśli trzeba
```
Po utworzeniu projektu: Project Settings -> General -> Your apps -> Add app (Web) -> skopiuj wartości do `.env.local` (wzór w `.env.local.example`).

**2. GitHub (repo)**
```bash
gh auth login
gh repo create tumolec --private --source=. --remote=origin --push
```

**3. Vercel (hosting)**
```bash
npm install -g vercel
vercel login
vercel link
vercel env add   # dodaj te same zmienne co w .env.local
vercel --prod
```

## Bezpieczeństwo

- `.env.local` nigdy nie jest commitowany (w `.gitignore`)
- Klucz konfiguracyjny Firebase w kliencie jest publiczny z założenia — ochronę zapewnia `firestore.rules`, nie ukrywanie klucza
- Zob. sekcję "Bezpieczeństwo" w planie projektu po pełne uzasadnienie
